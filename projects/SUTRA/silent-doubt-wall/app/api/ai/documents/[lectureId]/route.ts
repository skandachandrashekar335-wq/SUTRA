/**
 * POST /api/ai/documents/[lectureId]
 * Teacher-only: upload a lecture document for RAG indexing.
 *
 * GET /api/ai/documents/[lectureId]
 * Teacher-only: list documents for a lecture.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyTeacherCookieValue, getTeacherCookieName } from "@/lib/auth";
import { uploadAndIngestDocument, getDocumentsForLecture } from "@/lib/ai/document-service";
import { detectMimeFromFilename, MAX_FILE_SIZE_BYTES } from "@/lib/ai/document-extractor";
import type { SupportedMimeType } from "@/lib/ai/document-extractor";

const MAX_FILENAME_LENGTH = 200;

async function authorizeTeacher(lectureId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieName = getTeacherCookieName(lectureId);
  const cookieValue = cookieStore.get(cookieName)?.value;
  if (!cookieValue) return false;
  return Boolean(verifyTeacherCookieValue(cookieValue, lectureId));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const { lectureId } = await params;

  if (!(await authorizeTeacher(lectureId))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    // Validate filename
    const filename = file.name.slice(0, MAX_FILENAME_LENGTH).replace(/[^\w\s.\-()]/g, "_");

    if (!filename) {
      return NextResponse.json({ ok: false, error: "Invalid filename" }, { status: 400 });
    }

    const mimeType = detectMimeFromFilename(filename);
    if (!mimeType) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type. Use PDF, DOCX, PPTX, or TXT." },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "File too large (max 10 MB)" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await uploadAndIngestDocument({
      lectureId,
      teacherTokenHash: "", // verified via cookie
      filename,
      buffer,
      mimeType: mimeType as SupportedMimeType,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
    }

    // Don't return sensitive storage keys to client
    const { storageKey: _sk, ...safeDoc } = result.document;
    void _sk; // suppress unused warning

    return NextResponse.json({ ok: true, data: safeDoc }, { status: 201 });
  } catch (err: unknown) {
    console.error("[DocumentUpload]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Upload failed" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const { lectureId } = await params;

  if (!(await authorizeTeacher(lectureId))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const docs = await getDocumentsForLecture(lectureId);
    // Strip storage keys from response
    const safeDocs = docs.map(({ storageKey: _sk, ...d }) => { void _sk; return d; });

    return NextResponse.json({ ok: true, data: safeDocs });
  } catch (err: unknown) {
    console.error("[DocumentList]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to list documents" }, { status: 500 });
  }
}
