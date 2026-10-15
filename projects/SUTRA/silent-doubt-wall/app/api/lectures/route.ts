import { NextRequest, NextResponse } from "next/server";
import { createLectureSchema } from "@/lib/validation";
import { createLecture } from "@/lib/services/doubt-service";
import { createTeacherCookieValue, getTeacherCookieName, getTeacherCookieOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = createLectureSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { lecture, teacherSecret } = await createLecture({
      title: result.data.title,
      subject: result.data.subject,
      section: result.data.section,
    });

    // Create secure HTTP-only teacher session cookie bound to this lecture
    const cookieName = getTeacherCookieName(lecture.id);
    const cookieValue = createTeacherCookieValue(lecture.id, teacherSecret);
    const cookieOptions = getTeacherCookieOptions();

    const response = NextResponse.json({
      ok: true,
      data: {
        id: lecture.id,
        title: lecture.title,
        subject: lecture.subject,
        section: lecture.section,
        join_code: lecture.join_code,
        status: lecture.status,
        created_at: lecture.created_at,
      },
    });

    response.cookies.set(cookieName, cookieValue, cookieOptions);

    return response;
  } catch (error) {
    console.error("Create lecture error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to create lecture. Please try again." },
      { status: 500 }
    );
  }
}
