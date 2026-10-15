import { NextRequest, NextResponse } from "next/server";
import { joinLectureSchema } from "@/lib/validation";
import { getLiveLectureByCode } from "@/lib/services/doubt-service";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = joinLectureSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error.issues[0]?.message ?? "Invalid join code format" },
        { status: 400 }
      );
    }

    const lecture = await getLiveLectureByCode(result.data.join_code);

    if (!lecture) {
      return NextResponse.json(
        { ok: false, error: "No active lecture found with that code. Ask your teacher to confirm the code." },
        { status: 404 }
      );
    }

    // Return strictly safe public metadata (no teacher tokens or internal hashes)
    return NextResponse.json({
      ok: true,
      data: {
        id: lecture.id,
        title: lecture.title,
        subject: lecture.subject,
        section: lecture.section,
        join_code: lecture.join_code,
        status: lecture.status,
      },
    });
  } catch (error) {
    console.error("Join lecture error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to join lecture. Please try again." },
      { status: 500 }
    );
  }
}
