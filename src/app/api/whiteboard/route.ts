import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, geminiJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine, requireUser } from "@/lib/ai/server";
import { getSharedLesson, putSharedLesson } from "@/lib/whiteboard/cache";
import { lessonKey, sanitizeLesson, type Lesson } from "@/lib/whiteboard/types";
import { WHITEBOARD_SCHEMA, WHITEBOARD_SYSTEM, whiteboardPrompt } from "@/prompts/whiteboard.v1";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/whiteboard — a whiteboard lesson on a syllabus topic (section 7).
 * "Make once, share with everyone" (section 1A): cached lessons are replayed free;
 * only new topics call Gemini. Body: { topic, subject?, level?, curriculum?, language }.
 */
export async function POST(req: NextRequest) {
  const signedOut = await requireUser();
  if (signedOut) return signedOut;

  const body = (await req.json()) as { topic?: string; subject?: string; level?: string; curriculum?: string; language?: string };
  const topic = (body.topic ?? "").trim().slice(0, 200);
  if (topic.length < 2) return NextResponse.json({ error: "no_topic" }, { status: 400 });
  const language = body.language === "ar" ? "ar" : "en";
  const key = lessonKey(`${body.subject ?? ""} ${topic}`, body.level ?? "", language);

  const cached = await getSharedLesson(key);
  if (cached) return NextResponse.json({ lesson: cached, cached: true });

  const missing = requireEngine("gemini");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  try {
    const raw = await geminiJSON<unknown>(ROUTES.whiteboardLesson, {
      system: WHITEBOARD_SYSTEM,
      prompt: whiteboardPrompt({ topic, subject: body.subject, level: body.level, curriculum: body.curriculum, language }),
      schema: WHITEBOARD_SCHEMA,
      maxOutputTokens: 8192,
      minimalThinking: true,
      timeoutMs: 60000,
    });
    const lesson: Lesson = sanitizeLesson(raw, language);
    if (!lesson.segments.length) return NextResponse.json({ error: "empty", message: "The AI returned an empty lesson. Try again." }, { status: 502 });
    await putSharedLesson(key, lesson);
    return NextResponse.json({ lesson, cached: false });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
