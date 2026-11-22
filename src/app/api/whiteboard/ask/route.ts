import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { WHITEBOARD_ASK_SYSTEM } from "@/prompts/whiteboard.v1";

export const runtime = "nodejs";

/**
 * POST /api/whiteboard/ask — "interrupt and ask" (section 7.2): the student paused,
 * circled a shape and asked about it. The question is the student's own words, so Groq.
 * Body: { title, segment, shape: { kind, label?, text? }, question, language }
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;

  const b = (await req.json()) as {
    title: string;
    segment: string;
    shape: { kind: string; label?: string; text?: string } | null;
    question: string;
    language: "en" | "ar";
    teacher?: string;
  };
  const question = (b.question ?? "").slice(0, 2000).trim();
  if (!question) return NextResponse.json({ error: "no_question" }, { status: 400 });
  const shape = b.shape
    ? `The student circled: a ${b.shape.kind}${b.shape.label ? ` labelled "${b.shape.label}"` : ""}${b.shape.text ? ` showing "${b.shape.text}"` : ""}.`
    : "The student did not circle anything.";
  try {
    const answer = await groqText(
      ROUTES.whiteboardAsk,
      [
        { role: "system", content: `${WHITEBOARD_ASK_SYSTEM}${b.teacher ? `\n\n${String(b.teacher).slice(0, 1500)}` : ""}` },
        {
          role: "user",
          content: `Lesson: ${b.title}\nWhat you were saying: ${b.segment}\n${shape}\nReply in ${b.language === "ar" ? "Arabic" : "English"}.\nQuestion: ${question}`,
        },
      ],
      1500,
    );
    return NextResponse.json({ answer });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
