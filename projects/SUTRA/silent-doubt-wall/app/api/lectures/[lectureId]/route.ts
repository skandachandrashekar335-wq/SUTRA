import { NextRequest, NextResponse } from "next/server";
import { getLectureById, getRankedGroupsForTeacher, endLecture } from "@/lib/services/doubt-service";
import { verifyTeacherCookieValue, getTeacherCookieName } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  try {
    const { lectureId } = await params;
    const lecture = await getLectureById(lectureId);

    if (!lecture) {
      return NextResponse.json(
        { ok: false, error: "Lecture not found" },
        { status: 404 }
      );
    }

    // Check if caller is authorized teacher
    const cookieName = getTeacherCookieName(lectureId);
    const cookie = req.cookies.get(cookieName);
    const isTeacher = !!cookie && !!verifyTeacherCookieValue(cookie.value, lectureId);

    const groups = await getRankedGroupsForTeacher(lectureId);

    return NextResponse.json({
      ok: true,
      data: {
        lecture: {
          id: lecture.id,
          title: lecture.title,
          subject: lecture.subject,
          section: lecture.section,
          join_code: lecture.join_code,
          status: lecture.status,
          created_at: lecture.created_at,
          started_at: lecture.started_at,
          ended_at: lecture.ended_at,
        },
        groups,
        isTeacher,
      },
    });
  } catch (error) {
    console.error("Get lecture error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to retrieve lecture data" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  try {
    const { lectureId } = await params;

    // Strict Teacher Authorization check
    const cookieName = getTeacherCookieName(lectureId);
    const cookie = req.cookies.get(cookieName);

    if (!cookie || !verifyTeacherCookieValue(cookie.value, lectureId)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Valid teacher session required for this lecture." },
        { status: 401 }
      );
    }

    const body = await req.json();

    if (body.action === "end") {
      const success = await endLecture(lectureId);
      if (!success) {
        return NextResponse.json(
          { ok: false, error: "Failed to end lecture" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, data: { status: "ended" } });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Update lecture error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to update lecture status" },
      { status: 500 }
    );
  }
}
