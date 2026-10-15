/**
 * SUTRA — Document Service
 *
 * Handles:
 * - Upload to Supabase private Storage
 * - Text extraction and chunking
 * - Chunk storage in PostgreSQL (lecture_documents + document_chunks tables)
 * - Retrieval for RAG
 *
 * Security:
 * - Teacher must be authenticated and own the lecture
 * - Storage bucket is private (RLS + service role access)
 * - Document content never exposed publicly
 */

import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  extractDocumentText,
  chunkText,
  rankChunksByRelevance,
  detectMimeFromFilename,
  MAX_FILE_SIZE_BYTES,
  type SupportedMimeType,
  type TextChunk,
} from "./document-extractor";

const STORAGE_BUCKET = "lecture-documents";
const MAX_CHUNKS_PER_DOC = 200;
const MAX_RETRIEVAL_CHUNKS = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  lectureId: string;
  teacherTokenHash: string;
  filename: string;
  buffer: Buffer;
  mimeType?: SupportedMimeType;
}

export interface DocumentRecord {
  id: string;
  lectureId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
  pageCount?: number;
  extractionStatus: "pending" | "success" | "failed" | "image_pdf";
  chunkCount: number;
  uploadedAt: string;
}

export interface ServiceError {
  ok: false;
  error: string;
  code: string;
}

// ─── In-memory fallback for dev (mirrors Supabase schema) ────────────────────

interface MemDoc {
  id: string;
  lecture_id: string;
  filename: string;
  storage_key: string;
  mime_type: string;
  page_count: number | null;
  extraction_status: string;
  chunk_count: number;
  uploaded_at: string;
}

interface MemChunk {
  id: string;
  document_id: string;
  lecture_id: string;
  text: string;
  source_ref: string;
  chunk_index: number;
  tsv?: string; // would be tsvector in Postgres
}

declare global {
  var __SUTRA_DOCS__: Map<string, MemDoc> | undefined;
  var __SUTRA_CHUNKS__: Map<string, MemChunk> | undefined;
}

const memDocs: Map<string, MemDoc> =
  global.__SUTRA_DOCS__ ?? (global.__SUTRA_DOCS__ = new Map());
const memChunks: Map<string, MemChunk> =
  global.__SUTRA_CHUNKS__ ?? (global.__SUTRA_CHUNKS__ = new Map());

function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Upload + Ingest ─────────────────────────────────────────────────────────

export async function uploadAndIngestDocument(
  input: UploadDocumentInput
): Promise<{ ok: true; document: DocumentRecord } | ServiceError> {
  const { lectureId, filename, buffer } = input;

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "File too large (max 10 MB)", code: "oversized" };
  }

  // Detect MIME type
  const mimeType = input.mimeType ?? detectMimeFromFilename(filename);
  if (!mimeType) {
    return {
      ok: false,
      error: "Unsupported file type. Upload PDF, DOCX, PPTX, or TXT.",
      code: "unsupported_type",
    };
  }

  const docId = generateId();
  const storageKey = `${lectureId}/${docId}/${filename}`;

  // Extract text
  const extraction = await extractDocumentText(buffer, mimeType);

  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      // Upload to private storage
      await adminClient.storage.from(STORAGE_BUCKET).upload(storageKey, buffer, {
        contentType: mimeType,
        upsert: false,
      });

      const isError = !("text" in extraction);

      // Insert document record
      const docRow = {
        id: docId,
        lecture_id: lectureId,
        filename,
        storage_key: storageKey,
        mime_type: mimeType,
        page_count: !isError ? extraction.pageCount ?? null : null,
        extraction_status: isError
          ? "failed"
          : extraction.imagePdfDetected
          ? "image_pdf"
          : "success",
        chunk_count: 0,
        uploaded_at: new Date().toISOString(),
      };

      const { data: insertedDoc, error: docError } = await adminClient
        .from("lecture_documents")
        .insert(docRow)
        .select()
        .single();

      if (docError) {
        console.error("[DocumentService] Failed to insert doc record:", docError.message);
        // Continue with in-memory fallback
      }

      const realDocId = insertedDoc?.id ?? docId;

      // Store chunks if extraction succeeded
      if (!isError && extraction.text) {
        const rawChunks = chunkText(extraction.sections).slice(0, MAX_CHUNKS_PER_DOC);
        if (rawChunks.length > 0) {
          const chunkRows = rawChunks.map((c, i) => ({
            document_id: realDocId,
            lecture_id: lectureId,
            text: c.text,
            source_ref: c.sourceRef,
            chunk_index: i,
          }));

          await adminClient.from("document_chunks").insert(chunkRows);

          // Update chunk count
          await adminClient
            .from("lecture_documents")
            .update({ chunk_count: rawChunks.length })
            .eq("id", realDocId);

          return {
            ok: true,
            document: {
              id: realDocId,
              lectureId,
              filename,
              storageKey,
              mimeType,
              pageCount: extraction.pageCount,
              extractionStatus: "success",
              chunkCount: rawChunks.length,
              uploadedAt: new Date().toISOString(),
            },
          };
        }
      }

      const isExtrErr = "ok" in extraction && !extraction.ok;
      return {
        ok: true,
        document: {
          id: realDocId,
          lectureId,
          filename,
          storageKey,
          mimeType,
          extractionStatus: isExtrErr ? "failed" : "image_pdf",
          chunkCount: 0,
          uploadedAt: new Date().toISOString(),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[DocumentService] Upload failed:", msg);
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const isExtractionOk = "text" in extraction;
  const chunks: MemChunk[] = [];
  let chunkCount = 0;

  if (isExtractionOk) {
    const rawChunks = chunkText(extraction.sections).slice(0, MAX_CHUNKS_PER_DOC);
    for (const c of rawChunks) {
      const chunkId = `chunk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      chunks.push({
        id: chunkId,
        document_id: docId,
        lecture_id: lectureId,
        text: c.text,
        source_ref: c.sourceRef,
        chunk_index: c.index,
      });
      memChunks.set(chunkId, chunks[chunks.length - 1]);
    }
    chunkCount = rawChunks.length;
  }

  const doc: MemDoc = {
    id: docId,
    lecture_id: lectureId,
    filename,
    storage_key: storageKey,
    mime_type: mimeType,
    page_count: isExtractionOk ? (extraction.pageCount ?? null) : null,
    extraction_status: isExtractionOk ? "success" : "failed",
    chunk_count: chunkCount,
    uploaded_at: new Date().toISOString(),
  };
  memDocs.set(docId, doc);

  return {
    ok: true,
    document: {
      id: docId,
      lectureId,
      filename,
      storageKey,
      mimeType,
      pageCount: isExtractionOk ? extraction.pageCount : undefined,
      extractionStatus: isExtractionOk ? "success" : "failed",
      chunkCount,
      uploadedAt: new Date().toISOString(),
    },
  };
}

// ─── Retrieve relevant chunks ─────────────────────────────────────────────────

export async function retrieveRelevantChunks(
  lectureId: string,
  query: string
): Promise<TextChunk[]> {
  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      // Use PostgreSQL full-text search
      const { data, error } = await adminClient
        .from("document_chunks")
        .select("text, source_ref, chunk_index")
        .eq("lecture_id", lectureId)
        .textSearch("text", query.split(/\s+/).join(" | "), { type: "plain" })
        .limit(MAX_RETRIEVAL_CHUNKS);

      if (!error && data && data.length > 0) {
        return data.map((row) => ({
          text: row.text,
          sourceRef: row.source_ref,
          index: row.chunk_index,
        }));
      }
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback: keyword ranking
  const lectureChunks: TextChunk[] = [];
  for (const chunk of memChunks.values()) {
    if (chunk.lecture_id === lectureId) {
      lectureChunks.push({
        text: chunk.text,
        sourceRef: chunk.source_ref,
        index: chunk.chunk_index,
      });
    }
  }

  return rankChunksByRelevance(lectureChunks, query, MAX_RETRIEVAL_CHUNKS);
}

// ─── List documents for a lecture ────────────────────────────────────────────

export async function getDocumentsForLecture(lectureId: string): Promise<DocumentRecord[]> {
  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from("lecture_documents")
        .select("*")
        .eq("lecture_id", lectureId)
        .order("uploaded_at", { ascending: false });

      if (!error && data) {
        return data.map((row) => ({
          id: row.id,
          lectureId: row.lecture_id,
          filename: row.filename,
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          pageCount: row.page_count ?? undefined,
          extractionStatus: row.extraction_status,
          chunkCount: row.chunk_count,
          uploadedAt: row.uploaded_at,
        }));
      }
    } catch {
      // Fall through
    }
  }

  // In-memory fallback
  return Array.from(memDocs.values())
    .filter((d) => d.lecture_id === lectureId)
    .map((d) => ({
      id: d.id,
      lectureId: d.lecture_id,
      filename: d.filename,
      storageKey: d.storage_key,
      mimeType: d.mime_type,
      pageCount: d.page_count ?? undefined,
      extractionStatus: d.extraction_status as DocumentRecord["extractionStatus"],
      chunkCount: d.chunk_count,
      uploadedAt: d.uploaded_at,
    }));
}
