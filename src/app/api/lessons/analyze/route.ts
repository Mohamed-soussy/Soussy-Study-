import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, EngineError, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine, requireUser } from "@/lib/ai/server";
import { ANALYZE_SCHEMA, ANALYZE_SYSTEM, analyzeUser, type AnalyzeOut } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * POST /api/lessons/analyze — one part (~8 minutes) of a lesson transcript → homework,
 * tests, deadlines, key ideas and chapters, each with the time and exact quote (section 11.2).
 * Body: { title, subject, lessonDate: "YYYY-MM-DD", part, parts, text }
 * Counts as one AI use per lesson (on part 1).
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const b = (await req.json()) as { title?: string; subject?: string; lessonDate?: string; part?: number; parts?: number; text?: string };
  const part = Math.max(1, Number(b.part) || 1);
  const blocked = part === 1 ? await guardAi() : await requireUser();
  if (blocked) return blocked;
  const text = (b.text ?? "").slice(0, 16000);
  if (text.trim().length < 20) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const lessonDate = /^\d{4}-\d{2}-\d{2}$/.test(b.lessonDate ?? "") ? b.lessonDate! : new Date().toISOString().slice(0, 10);
  const weekday = WEEKDAYS[new Date(`${lessonDate}T12:00:00Z`).getUTCDay()];
  try {
    const out = await groqJSON<AnalyzeOut>(ROUTES.lesson, {
      name: "lesson_part",
      schema: ANALYZE_SCHEMA,
      maxTokens: 3000,
      messages: [
        { role: "system", content: ANALYZE_SYSTEM },
        {
          role: "user",
          content: analyzeUser({
            subject: (b.subject ?? "").slice(0, 80),
            title: (b.title ?? "Lesson").slice(0, 120),
            lessonDate,
            weekday,
            part,
            parts: Math.max(part, Number(b.parts) || part),
            text,
          }),
        },
      ],
    });
    return NextResponse.json(out);
  } catch (err) {
    const status = err instanceof EngineError && err.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err), retryAfter: err instanceof EngineError ? err.retryAfter : 0 }, { status });
  }
}
