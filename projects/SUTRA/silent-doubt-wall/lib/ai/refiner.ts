/**
 * SUTRA — AI Question Refiner
 *
 * Takes a student's raw question and suggests an improved version:
 * - Corrects spelling, grammar and punctuation
 * - Preserves technical terminology, identifiers and scope
 * - Does NOT silently change meaning
 * - Returns structured output for the UI to accept/edit/dismiss
 *
 * If the AI provider is unavailable, the fallback is the local
 * deterministic cleanDoubtText() from the doubt-engine.
 */

import { aiGenerateJson } from "@/lib/ai/provider";
import { cleanDoubtText } from "@/lib/nlp/doubt-engine";
import { getFeatureAvailability } from "@/lib/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RefineResult {
  /** The suggested improved version of the question */
  suggested: string;
  /** Whether AI was used or just the local cleaner */
  source: "ai" | "local";
  /** Provider that generated the suggestion (if AI) */
  provider?: string;
  /** True if the input was ambiguous and couldn't be reliably refined */
  ambiguous?: boolean;
  /** Explanation shown in the tooltip / suggestion card */
  explanation?: string;
}

export interface RefineError {
  ok: false;
  error: string;
}

// ─── Response shape validator ─────────────────────────────────────────────────

interface RefineResponse {
  refined: string;
  ambiguous: boolean;
  changes: string;
}

function isRefineResponse(v: unknown): v is RefineResponse {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.refined === "string" &&
    r.refined.length > 0 &&
    typeof r.ambiguous === "boolean" &&
    typeof r.changes === "string"
  );
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildRefinePrompt(original: string): string {
  return `You are a helpful academic assistant. A student submitted this question anonymously in a classroom:

"${original}"

Your task:
1. Suggest a cleaner, better-written version of this question.
2. Fix spelling errors, grammar mistakes, and unclear phrasing.
3. PRESERVE: technical terms, code identifiers, math notation, variable names, library/API names (e.g. OpenCV, NumPy, O(n log n), ∂f/∂x).
4. PRESERVE the exact scope and intent — do NOT change what concept is being asked about.
5. If the question is ambiguous or has multiple possible interpretations, set "ambiguous": true.
6. If only minor cleanup is needed (1–2 words), keep changes minimal.
7. Keep the output as a question (end with ?).

Respond with ONLY a JSON object in this exact shape:
{
  "refined": "<improved question>",
  "ambiguous": false,
  "changes": "<one sentence summary of what was changed, or 'none' if no changes needed>"
}`;
}

// ─── Main refiner ─────────────────────────────────────────────────────────────

/**
 * Suggest an improved version of a student question.
 * Falls back gracefully when AI is unavailable.
 */
export async function refineQuestion(
  original: string
): Promise<RefineResult> {
  if (!original || original.trim().length === 0) {
    return { suggested: original, source: "local" };
  }

  // Always run local cleaner first for immediate feedback
  const localCleaned = cleanDoubtText(original);

  // Try AI refinement if available
  const features = getFeatureAvailability();
  if (!features.aiAvailable) {
    return { suggested: localCleaned, source: "local" };
  }

  const result = await aiGenerateJson(
    {
      messages: [{ role: "user", content: buildRefinePrompt(original) }],
      maxOutputTokens: 256,
      temperature: 0.1,
    },
    isRefineResponse
  );

  if (!("result" in result)) {
    // AI failed — fall back to local
    return { suggested: localCleaned, source: "local" };
  }

  const { result: parsed, provider } = result;

  // Sanity check: if the AI output is wildly different in length, distrust it
  const ratio = parsed.refined.length / (original.length || 1);
  if (ratio > 3 || ratio < 0.2 || parsed.refined.trim().length < 5) {
    return { suggested: localCleaned, source: "local" };
  }

  return {
    suggested: parsed.refined.trim(),
    source: "ai",
    provider,
    ambiguous: parsed.ambiguous,
    explanation: parsed.changes === "none" ? undefined : parsed.changes,
  };
}

// ─── Batch refiner (for pre-processing submitted doubts) ─────────────────────

/**
 * Light, non-blocking refinement used server-side after doubt submission.
 * Does NOT block the submission path — returns local cleaned text on timeout.
 */
export async function refineQuestionServer(
  original: string,
  timeoutMs = 5000
): Promise<string> {
  try {
    const race = await Promise.race([
      refineQuestion(original),
      new Promise<RefineResult>((resolve) =>
        setTimeout(
          () => resolve({ suggested: cleanDoubtText(original), source: "local" }),
          timeoutMs
        )
      ),
    ]);
    return race.suggested;
  } catch {
    return cleanDoubtText(original);
  }
}
