import { NextRequest, NextResponse } from "next/server";
import { voteSchema } from "@/lib/validation";
import { toggleVote } from "@/lib/services/doubt-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = voteSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error.issues[0]?.message ?? "Invalid vote data" },
        { status: 400 }
      );
    }

    const { voted, voteCount } = await toggleVote({
      groupId: result.data.group_id,
      sessionToken: result.data.session_token,
    });

    return NextResponse.json({
      ok: true,
      data: {
        voted,
        voteCount,
      },
    });
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to record vote" },
      { status: 500 }
    );
  }
}
