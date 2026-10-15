/**
 * SUTRA — Document Extraction Service
 *
 * Extracts text from uploaded teacher documents (PDF, DOCX, PPTX, TXT).
 * Runs server-side only. Never exposes document content to the client.
 * Treats document content as untrusted data (prompt injection prevention).
 */

import type { Buffer } from "buffer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportedMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "text/plain";

export interface ExtractionResult {
  text: string;
  /** Number of pages/slides where available */
  pageCount?: number;
  /** Source location hints for citations: [{page: 1, text: "..."}, ...] */
  sections: ExtractionSection[];
  mimeType: SupportedMimeType;
  extractedAt: string;
  /** True if this is a scanned/image PDF with no extractable text */
  imagePdfDetected?: boolean;
}

export interface ExtractionSection {
  /** Page number (PDF), slide number (PPTX), or paragraph index (DOCX) */
  ref: string;
  text: string;
}

export interface ExtractionError {
  ok: false;
  error: string;
  code: "unsupported_type" | "extraction_failed" | "empty_content" | "oversized";
}

export const MAX_DOCUMENT_TEXT_CHARS = 200_000; // ~40k tokens
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── MIME type detection ──────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS: Record<string, SupportedMimeType> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

export function detectMimeFromFilename(filename: string): SupportedMimeType | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

// ─── Extractors ───────────────────────────────────────────────────────────────

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  // pdf-parse is a CJS module
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);

  const rawText = data.text ?? "";
  const sections: ExtractionSection[] = [];

  // Split by form-feed characters (page breaks) to get per-page sections
  const pages = rawText.split(/\f/);
  for (let i = 0; i < pages.length; i++) {
    const t = pages[i].trim();
    if (t.length > 10) {
      sections.push({ ref: `page ${i + 1}`, text: t.slice(0, 2000) });
    }
  }

  const imagePdfDetected = rawText.trim().length < 50 && (data.numpages ?? 0) > 0;

  return {
    text: rawText.slice(0, MAX_DOCUMENT_TEXT_CHARS),
    pageCount: data.numpages,
    sections,
    mimeType: "application/pdf",
    extractedAt: new Date().toISOString(),
    imagePdfDetected,
  };
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value ?? "";

  // Split on paragraph breaks for sections
  const paragraphs = rawText.split(/\n{2,}/).filter((p) => p.trim().length > 20);
  const sections: ExtractionSection[] = paragraphs.map((p, i) => ({
    ref: `paragraph ${i + 1}`,
    text: p.slice(0, 500),
  }));

  return {
    text: rawText.slice(0, MAX_DOCUMENT_TEXT_CHARS),
    pageCount: undefined,
    sections,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extractedAt: new Date().toISOString(),
  };
}

async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  const sections: ExtractionSection[] = [];
  const allText: string[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const content = await zip.files[slideFiles[i]].async("string");
    // Strip XML tags and collapse whitespace
    const text = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 5) {
      const snippet = text.slice(0, 500);
      sections.push({ ref: `slide ${i + 1}`, text: snippet });
      allText.push(text);
    }
  }

  return {
    text: allText.join("\n\n").slice(0, MAX_DOCUMENT_TEXT_CHARS),
    pageCount: slideFiles.length,
    sections,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extractedAt: new Date().toISOString(),
  };
}

function extractTxt(buffer: Buffer): ExtractionResult {
  const rawText = buffer.toString("utf-8");
  const paragraphs = rawText.split(/\n{2,}/).filter((p) => p.trim().length > 10);
  const sections: ExtractionSection[] = paragraphs.map((p, i) => ({
    ref: `section ${i + 1}`,
    text: p.slice(0, 500),
  }));

  return {
    text: rawText.slice(0, MAX_DOCUMENT_TEXT_CHARS),
    sections,
    mimeType: "text/plain",
    extractedAt: new Date().toISOString(),
  };
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: SupportedMimeType
): Promise<ExtractionResult | ExtractionError> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `File exceeds ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit`,
      code: "oversized",
    };
  }

  try {
    let result: ExtractionResult;

    switch (mimeType) {
      case "application/pdf":
        result = await extractPdf(buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        result = await extractDocx(buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        result = await extractPptx(buffer);
        break;
      case "text/plain":
        result = extractTxt(buffer);
        break;
      default:
        return { ok: false, error: "Unsupported file type", code: "unsupported_type" };
    }

    if (!result.text || result.text.trim().length < 10) {
      if (result.imagePdfDetected) {
        return {
          ok: false,
          error:
            "This PDF appears to be a scanned image. Text extraction requires OCR, which is not yet supported.",
          code: "empty_content",
        };
      }
      return { ok: false, error: "No readable text found in document", code: "empty_content" };
    }

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown extraction error";
    return { ok: false, error: `Extraction failed: ${msg}`, code: "extraction_failed" };
  }
}

// ─── Chunker ──────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;

export interface TextChunk {
  text: string;
  sourceRef: string;
  index: number;
}

/**
 * Split extracted text into overlapping chunks for storage and retrieval.
 * Uses sentence boundaries where possible.
 */
export function chunkText(sections: ExtractionSection[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    const text = section.text;
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ text, sourceRef: section.ref, index: globalIndex++ });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      // Try to break at sentence boundary
      const slice = text.slice(start, end);
      const lastSentence = slice.search(/[.!?][^.!?]*$/);
      const breakAt = lastSentence > CHUNK_SIZE * 0.5 ? lastSentence + 1 : end;

      chunks.push({
        text: text.slice(start, start + breakAt).trim(),
        sourceRef: section.ref,
        index: globalIndex++,
      });

      start += breakAt - CHUNK_OVERLAP;
      if (start >= text.length) break;
    }
  }

  return chunks;
}

// ─── BM25-style full-text relevance retrieval ─────────────────────────────────

/**
 * Retrieve the most relevant chunks for a query using keyword matching.
 * Used when pgvector is unavailable — falls back to PostgreSQL full-text.
 */
export function rankChunksByRelevance(
  chunks: TextChunk[],
  query: string,
  topK = 5
): TextChunk[] {
  const qTokens = new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  const scored = chunks.map((chunk) => {
    const chunkTokens = chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);

    let score = 0;
    for (const token of chunkTokens) {
      if (qTokens.has(token)) score++;
    }
    return { chunk, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((s) => s.score > 0)
    .map((s) => s.chunk);
}
