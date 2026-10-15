/**
 * POST /api/ai/refine
 * Suggests an improved version of a student's question.
 * Never blocks submission — returns original text on AI failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refineQuestion } from "@/lib/ai/refiner";
import { getFeatureAvailability } from "@/lib/env";

const bodySchema = z.object({
  text: z.string().min(3).max(500).trim(),
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

    const { text } = parsed.data;
    const result = await refineQuestion(text);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Refinement service unavailable" },
      { status: 200 } // 200 so client still gets a usable response
    );
  }
}

export async function GET() {
  const features = getFeatureAvailability();
  return NextResponse.json({
    ok: true,
    data: {
      aiAvailable: features.aiAvailable,
      gemini: features.gemini,
      openRouter: features.openRouter,
    },
  });
}
