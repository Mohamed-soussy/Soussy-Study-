import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, geminiJSON, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine, requireUser } from "@/lib/ai/server";
import { getSharedLesson, putSharedLesson } from "@/lib/whiteboard/cache";
import { lessonKey, sanitizeLesson, type Lesson } from "@/lib/whiteboard/types";
import { solutionWhiteboardPrompt, WHITEBOARD_SCHEMA, WHITEBOARD_SCHEMA_STRICT, WHITEBOARD_SYSTEM, whiteboardPrompt } from "@/prompts/whiteboard.v1";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/whiteboard — a whiteboard lesson on a syllabus topic (section 7).
 * "Make once, share with everyone" (section 1A): cached lessons are replayed free;
 * only new topics call Gemini. Body: { topic, subject?, level?, curriculum?, language }.
 */
export async function POST(req: NextRequest) {
  const signedOut = await requireUser();
  if (signedOut) return signedOut;

  const body = (await req.json()) as { topic?: string; subject?: string; level?: string; curriculum?: string; language?: string; detail?: string; problem?: string; solution?: unknown };

  // A student's own solved problem (from the solver) is personal: Groq, and never cached for others.
  if (body.solution && body.problem) {
    const missingGroq = requireEngine("groq");
    if (missingGroq) return missingGroq;
    const blockedGroq = await guardAi();
    if (blockedGroq) return blockedGroq;
    const lang = body.language === "ar" ? "ar" : "en";
    try {
      const raw = await groqJSON<unknown>(ROUTES.whiteboardAsk, {
        name: "lesson",
        schema: WHITEBOARD_SCHEMA_STRICT,
        maxTokens: 3500,
        messages: [
          { role: "system", content: WHITEBOARD_SYSTEM },
          { role: "user", content: solutionWhiteboardPrompt(body.problem, body.solution, lang) },
        ],
      });
      const lesson = sanitizeLesson(raw, lang);
      if (!lesson.segments.length) return NextResponse.json({ error: "empty", message: "The AI returned an empty lesson. Try again." }, { status: 502 });
      return NextResponse.json({ lesson, cached: false });
    } catch (err) {
      return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
    }
  }

  const topic = (body.topic ?? "").trim().slice(0, 2000);
  const detail = body.detail === "full" || body.detail === "detailed" ? body.detail : "quick";
  if (topic.length < 2) return NextResponse.json({ error: "no_topic" }, { status: 400 });
  const language = body.language === "ar" ? "ar" : "en";
  const key = lessonKey(`${body.subject ?? ""} ${topic}`, `${body.level ?? ""}${detail === "quick" ? "" : `|${detail}`}`, language);

  const cached = await getSharedLesson(key);
  if (cached) return NextResponse.json({ lesson: cached, cached: true });

  const missing = requireEngine("gemini");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  try {
    const raw = await geminiJSON<unknown>(detail === "quick" ? ROUTES.whiteboardLesson : ROUTES.whiteboardLong, {
      system: WHITEBOARD_SYSTEM,
      prompt: whiteboardPrompt({ topic, subject: body.subject, level: body.level, curriculum: body.curriculum, language, detail }),
      schema: WHITEBOARD_SCHEMA,
      maxOutputTokens: detail === "full" ? 32000 : detail === "detailed" ? 20000 : 8192,
      minimalThinking: true,
      timeoutMs: detail === "quick" ? 60000 : 110000,
    });
    const lesson: Lesson = sanitizeLesson(raw, language);
    if (!lesson.segments.length) return NextResponse.json({ error: "empty", message: "The AI returned an empty lesson. Try again." }, { status: 502 });
    await putSharedLesson(key, lesson);
    return NextResponse.json({ lesson, cached: false });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
