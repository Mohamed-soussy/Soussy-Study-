import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { QUIZ_SCHEMA, type QuizQuestion } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/squads/battle — 8 quick multiple-choice questions for a Squad quiz battle. */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { topic?: string; level?: string };
  const topic = (b.topic ?? "").slice(0, 120);
  if (topic.length < 3) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const out = await groqJSON<{ questions: QuizQuestion[] }>(ROUTES.coach, {
      name: "battle",
      schema: QUIZ_SCHEMA,
      maxTokens: 2600,
      messages: [
        {
          role: "user",
          content: `Write 8 multiple-choice questions on "${topic}" for ${(b.level ?? "high school").slice(0, 60)} students, quick to answer (under 20 seconds each), from easy to hard. 4 options each; "answer" is the index 0–3 of the correct option; "why" is one sentence; "at" is "". Plain text, Unicode math, no LaTeX. Original questions, not from past papers.`,
        },
      ],
    });
    const questions = out.questions.filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length).slice(0, 8);
    return NextResponse.json({ questions });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
