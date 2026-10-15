/**
 * GET /api/ai/insights/[lectureId]
 * Teacher-only endpoint. Returns lecture stats + AI insights.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyTeacherCookieValue, getTeacherCookieName } from "@/lib/auth";
import { generateTeacherInsights, type LectureStats } from "@/lib/ai/insights";
import { getActiveGroupsForLecture, getLectureById } from "@/lib/services/doubt-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const { lectureId } = await params;

  // Verify teacher session
  const cookieStore = await cookies();
  const cookieName = getTeacherCookieName(lectureId);
  const cookieValue = cookieStore.get(cookieName)?.value;

  if (!cookieValue) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const session = verifyTeacherCookieValue(cookieValue, lectureId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Session invalid or expired" }, { status: 401 });
  }

  try {
    const lecture = await getLectureById(lectureId);
    if (!lecture) {
      return NextResponse.json({ ok: false, error: "Lecture not found" }, { status: 404 });
    }

    const groups = await getActiveGroupsForLecture(lectureId);

    // Calculate factual stats from real data
    const stats: LectureStats = {
      totalDoubts: groups.reduce((sum, g) => sum + g.total_submissions, 0),
      approvedDoubts: groups.reduce((sum, g) => sum + g.total_submissions, 0),
      needsReviewDoubts: 0, // Would query doubts table in production
      rejectedDoubts: 0,
      totalGroups: groups.length,
      totalVotes: groups.reduce((sum, g) => sum + g.vote_count, 0),
      topGroups: groups.slice(0, 5),
    };

    const insights = await generateTeacherInsights(groups, stats);

    return NextResponse.json({ ok: true, data: insights });
  } catch (err: unknown) {
    console.error("[Insights API]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "Failed to generate insights" }, { status: 500 });
  }
}
