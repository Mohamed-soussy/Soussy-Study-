import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { examPrompt, EXAM_SCHEMA, type Exam } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 90;

/** POST /api/coach/exam — an original timed mock exam (section 12.1). */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { course?: string; curriculum?: string; units?: string[]; style?: string; minutes?: number; calculator?: boolean };
  const units = (b.units ?? []).map((u) => u.slice(0, 120)).filter(Boolean).slice(0, 6);
  if (!b.course || !units.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const minutes = Math.min(60, Math.max(10, Number(b.minutes) || 30));
  try {
    const exam = await groqJSON<Exam>(ROUTES.coach, {
      name: "mock_exam",
      schema: EXAM_SCHEMA,
      maxTokens: 6000,
      effort: "medium",
      messages: [{ role: "user", content: examPrompt({ course: b.course.slice(0, 80), curriculum: (b.curriculum ?? "").slice(0, 40), units, style: (b.style ?? "").slice(0, 60), minutes, calculator: b.calculator !== false }) }],
    });
    exam.questions = exam.questions
      .filter((q) => q.prompt && q.marks > 0)
      .map((q, i) => ({ ...q, n: i + 1, options: q.type === "mcq" ? q.options.slice(0, 4) : [], answer: q.type === "mcq" ? q.answer : -1, marks: q.type === "mcq" ? 1 : Math.min(12, q.marks) }))
      .filter((q) => q.type !== "mcq" || (q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length));
    return NextResponse.json({ exam, minutes });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
