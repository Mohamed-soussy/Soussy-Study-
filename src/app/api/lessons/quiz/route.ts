import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { QUIZ_PROMPT, QUIZ_SCHEMA, type QuizQuestion } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/lessons/quiz — a 10-question quiz on one lesson (section 11.3). Body: { notes, count? } */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { notes?: string; count?: number };
  const notes = (b.notes ?? "").slice(0, 12000);
  if (notes.trim().length < 40) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const count = Math.min(15, Math.max(3, Number(b.count) || 10));
  try {
    const out = await groqJSON<{ questions: QuizQuestion[] }>(ROUTES.lesson, {
      name: "lesson_quiz",
      schema: QUIZ_SCHEMA,
      maxTokens: 3200,
      messages: [{ role: "user", content: QUIZ_PROMPT(notes, count) }],
    });
    const questions = out.questions
      .filter((q) => q.q && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .map((q) => ({ ...q, options: q.options.slice(0, 4), at: q.at.replace(/[[\]]/g, "") }))
      .filter((q) => q.answer < q.options.length)
      .slice(0, count);
    return NextResponse.json({ questions });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
