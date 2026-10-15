import { NextRequest, NextResponse } from "next/server";
import { submitDoubtSchema } from "@/lib/validation";
import { submitDoubt, getApprovedDoubtsForStudent, getActiveGroupsForLecture } from "@/lib/services/doubt-service";
// Server-side moderation is run independently of the service layer
// so a forged request that bypasses the client cannot slip through.
import { moderateDoubt } from "@/lib/nlp/doubt-engine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = submitDoubtSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error.issues[0]?.message ?? "Invalid question format" },
        { status: 400 }
      );
    }

    // ── Server-side moderation gate (independent of service layer) ─────────
    // Run moderation directly on the raw submitted text before touching any
    // storage. This means a forged API call that bypasses the client UI still
    // cannot insert a rejected submission.
    const serverModerationCheck = moderateDoubt(result.data.text);
    if (serverModerationCheck.status === "rejected") {
      return NextResponse.json(
        {
          ok: false,
          error: "Your submission could not be accepted as it violates classroom guidelines.",
          moderationStatus: "rejected",
        },
        { status: 422 }
      );
    }

    const { doubt, group, status } = await submitDoubt({
      lectureId: result.data.lecture_id,
      rawText: result.data.text,
      sessionToken: result.data.session_token,
    });

    // Belt-and-suspenders: service layer should never reach here with rejected
    // status (it returns early), but guard anyway.
    if (status === "rejected") {
      return NextResponse.json(
        {
          ok: false,
          error: "Your submission could not be accepted as it violates classroom guidelines.",
          moderationStatus: "rejected",
        },
        { status: 422 }
      );
    }

    // needs_review: submission was received and held for teacher review.
    // Return a non-error response so the client can show a "pending review" message,
    // but the groupId is NOT returned (so the client cannot add it to the visible feed).
    if (status === "needs_review") {
      return NextResponse.json({
        ok: true,
        data: {
          id: doubt.id,
          text: null,           // Do NOT expose content back to client
          groupId: null,        // Never add needs_review to visible feed
          moderationStatus: "needs_review",
          submittedAt: doubt.submitted_at,
        },
      });
    }

    // approved
    return NextResponse.json({
      ok: true,
      data: {
        id: doubt.id,
        text: doubt.cleaned_text || doubt.original_text,
        groupId: group.id,
        moderationStatus: status,
        submittedAt: doubt.submitted_at,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to submit doubt";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId");
    const sessionToken = searchParams.get("sessionToken") || "";

    if (!lectureId) {
      return NextResponse.json(
        { ok: false, error: "Missing lectureId parameter" },
        { status: 400 }
      );
    }

    // Only approved doubts and active groups are returned.
    // needs_review and rejected doubts are never surfaced here.
    const [doubts, groups] = await Promise.all([
      getApprovedDoubtsForStudent(lectureId, sessionToken),
      getActiveGroupsForLecture(lectureId),
    ]);

    return NextResponse.json({
      ok: true,
      data: { doubts, groups },
    });
  } catch (error) {
    console.error("List doubts error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch doubts" },
      { status: 500 }
    );
  }
}
