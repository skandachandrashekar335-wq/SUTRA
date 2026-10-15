/**
 * SUTRA — RAG Answer Service
 *
 * Generates evidence-grounded answers for student doubts using
 * retrieved lecture document chunks.
 *
 * Safety rules:
 * - Only answers when retrieved evidence supports it
 * - Returns insufficient-evidence result rather than guessing
 * - Validates citations against actual retrieved chunks (no fabrication)
 * - Treats document content as data, not instructions
 * - Never publishes after teacher has already answered
 */

import { aiGenerateJson } from "@/lib/ai/provider";
import { getFeatureAvailability } from "@/lib/env";
import type { TextChunk } from "./document-extractor";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Citation {
  sourceRef: string;   // e.g. "page 3", "slide 7"
  snippet: string;     // Short quote from the source
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
  confidence: "high" | "medium" | "low";
  provider: string;
  model: string;
  generatedAt: string;
}

export interface InsufficientEvidence {
  ok: false;
  reason: "no_documents" | "no_relevant_chunks" | "ai_unavailable" | "evidence_insufficient";
  message: string;
}

export type RagResult = { ok: true; answer: RagAnswer } | InsufficientEvidence;

// ─── Response shape ───────────────────────────────────────────────────────────

interface RagResponse {
  answer: string;
  citations: Array<{ ref: string; snippet: string }>;
  confidence: "high" | "medium" | "low";
  sufficient: boolean;
}

function isRagResponse(v: unknown): v is RagResponse {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.answer === "string" &&
    Array.isArray(r.citations) &&
    typeof r.sufficient === "boolean" &&
    (r.confidence === "high" || r.confidence === "medium" || r.confidence === "low")
  );
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

/** Strip any model-injection attempts from document content */
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/\[SYSTEM\]/gi, "[CONTENT]")
    .replace(/\[INST\]/gi, "[TEXT]")
    .replace(/<<SYS>>/gi, "<<CONTENT>>")
    .slice(0, 1500);
}

function buildRagPrompt(question: string, chunks: TextChunk[]): string {
  const evidence = chunks
    .map(
      (c, i) =>
        `[SOURCE ${i + 1} — ${c.sourceRef}]\n${sanitizeForPrompt(c.text)}`
    )
    .join("\n\n");

  return `You are an academic assistant. Answer a student's question using ONLY the provided lecture notes.

STUDENT QUESTION:
"${question}"

LECTURE NOTES (the only permitted source):
${evidence}

RULES:
1. Answer based ONLY on the above lecture notes. Do not use general knowledge.
2. If the notes do not contain enough information to answer, set "sufficient": false.
3. Cite the exact source reference for every claim (e.g., "page 3", "slide 7").
4. Keep the answer concise (3-5 sentences maximum).
5. Preserve technical terminology exactly as written in the notes.
6. Do not invent page numbers or source references.

Respond with ONLY a JSON object in this exact shape:
{
  "answer": "<your answer or empty string if insufficient evidence>",
  "citations": [{"ref": "<source ref>", "snippet": "<short quote from that source>"}],
  "confidence": "high" | "medium" | "low",
  "sufficient": true | false
}`;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateRagAnswer(
  question: string,
  relevantChunks: TextChunk[]
): Promise<RagResult> {
  const features = getFeatureAvailability();

  if (!features.aiAvailable) {
    return {
      ok: false,
      reason: "ai_unavailable",
      message: "AI provider not configured",
    };
  }

  if (relevantChunks.length === 0) {
    return {
      ok: false,
      reason: "no_relevant_chunks",
      message: "No relevant content found in lecture documents for this question",
    };
  }

  const result = await aiGenerateJson(
    {
      messages: [{ role: "user", content: buildRagPrompt(question, relevantChunks) }],
      maxOutputTokens: 512,
      temperature: 0.1,
    },
    isRagResponse
  );

  if (!("result" in result)) {
    return {
      ok: false,
      reason: "ai_unavailable",
      message: "AI provider failed to generate an answer",
    };
  }

  const { result: parsed, provider, model } = result;

  if (!parsed.sufficient || !parsed.answer || parsed.answer.trim().length < 10) {
    return {
      ok: false,
      reason: "evidence_insufficient",
      message: "The lecture notes don't contain enough information to answer this question",
    };
  }

  // Validate citations: only include ones that match an actual chunk's sourceRef
  const validRefs = new Set(relevantChunks.map((c) => c.sourceRef));
  const validatedCitations: Citation[] = parsed.citations
    .filter((c) => validRefs.has(c.ref) && c.snippet && c.snippet.length > 5)
    .map((c) => ({ sourceRef: c.ref, snippet: c.snippet.slice(0, 200) }));

  return {
    ok: true,
    answer: {
      answer: parsed.answer.trim(),
      citations: validatedCitations,
      confidence: parsed.confidence,
      provider,
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}
