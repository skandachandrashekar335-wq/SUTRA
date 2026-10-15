/**
 * POST /api/ai/answer
 * Generate a RAG answer for a student question using uploaded lecture documents.
 * Returns insufficient-evidence result if docs don't support an answer.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { retrieveRelevantChunks } from "@/lib/ai/document-service";
import { generateRagAnswer } from "@/lib/ai/rag-answer";

const bodySchema = z.object({
  lectureId: z.string().min(1),
  question: z.string().min(3).max(500).trim(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { ok: false, error: firstIssue?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { lectureId, question } = parsed.data;

    // Retrieve relevant chunks for this lecture
    const chunks = await retrieveRelevantChunks(lectureId, question);

    if (chunks.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          answered: false,
          reason: "no_documents",
          message: "No lecture documents have been uploaded for this lecture yet.",
        },
      });
    }

    const result = await generateRagAnswer(question, chunks);

    if (!result.ok) {
      return NextResponse.json({
        ok: true,
        data: {
          answered: false,
          reason: result.reason,
          message: result.message,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        answered: true,
        answer: result.answer,
      },
    });
  } catch (err: unknown) {
    console.error("[RAG Answer]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Answer service unavailable" },
      { status: 500 }
    );
  }
}
