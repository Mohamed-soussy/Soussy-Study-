import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { webSearch } from "@/lib/search/tavily";
import { examPrompt, EXAM_SCHEMA, QUESTION_TYPES, type Exam, type QuestionType } from "@/prompts/coach.v1";

export const runtime = "nodejs";
export const maxDuration = 120;

const AUTO = new Set(["mcq", "truefalse"]);

/**
 * POST /api/coach/exam — an original timed mock exam (section 12.1).
 * First looks up the REAL exam format for this curriculum/subject/topic on the web
 * (public text only), then writes new questions in that format.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as {
    course?: string;
    curriculum?: string;
    units?: string[];
    topic?: string;
    style?: string;
    minutes?: number;
    calculator?: boolean;
    difficulty?: string;
    types?: string[];
  };
  const units = (b.units ?? []).map((u) => u.slice(0, 120)).filter(Boolean).slice(0, 6);
  const topic = (b.topic ?? "").trim().slice(0, 600);
  if (!b.course || !(units.length || topic)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const minutes = Math.min(120, Math.max(10, Number(b.minutes) || 30));
  const difficulty = b.difficulty === "easy" || b.difficulty === "hard" ? b.difficulty : "medium";
  const types = (b.types ?? []).filter((t): t is QuestionType => (QUESTION_TYPES as readonly string[]).includes(t));
  const course = b.course.slice(0, 80);
  const curriculum = (b.curriculum ?? "").slice(0, 80);
  const style = (b.style ?? "").slice(0, 80);

  // Deep search: how the real exam looks (structure, command terms, marks), plus the topic itself.
  const about = topic || units.join(", ");
  const [format, content] = await Promise.all([
    webSearch(`${curriculum} ${course} ${style} exam paper format question types command terms markscheme`, { max: 4, depth: "advanced" }),
    webSearch(`${curriculum} ${course} ${about} exam questions`, { max: 4 }),
  ]);
  const sources = [...format, ...content].filter((r, i, a) => r.url && a.findIndex((x) => x.url === r.url) === i);
  const research = sources.map((r) => `• ${r.title} (${new URL(r.url).hostname}): ${r.content.replace(/\s+/g, " ")}`).join("\n").slice(0, 6000);

  try {
    const exam = await groqJSON<Exam>(ROUTES.coach, {
      name: "mock_exam",
      schema: EXAM_SCHEMA,
      maxTokens: 7000,
      effort: "medium",
      messages: [{ role: "user", content: examPrompt({ course, curriculum, units, topic, style, minutes, calculator: b.calculator !== false, difficulty, types, research }) }],
    });
    exam.questions = exam.questions
      .filter((q) => q.prompt && q.marks > 0)
      .map((q, i) => {
        if (q.type === "truefalse") return { ...q, n: i + 1, options: ["True", "False"], answer: q.answer === 1 ? 1 : 0, marks: 1 };
        if (q.type === "mcq") return { ...q, n: i + 1, options: q.options.slice(0, 4), marks: 1 };
        return { ...q, n: i + 1, options: [], answer: -1, marks: Math.min(q.type === "essay" ? 30 : 12, q.marks) };
      })
      .filter((q) => q.type !== "mcq" || (q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length));
    return NextResponse.json({ exam, minutes, sources: sources.slice(0, 6).map((r) => ({ title: r.title, url: r.url })), auto: [...AUTO] });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
