import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";

export const runtime = "nodejs";

/**
 * POST /api/explain-back — the end-of-session check (sections 6A.3, 12A.1):
 * "In your own words, what did you just study?" The student explains; the AI gives
 * ONE line of feedback. The student does the explaining, not the AI.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { studied: string; answer: string; language?: string };
  const answer = (b.answer ?? "").slice(0, 2000).trim();
  if (answer.length < 5) return NextResponse.json({ error: "too_short" }, { status: 400 });
  try {
    const feedback = await groqText(
      ROUTES.chat,
      [
        {
          role: "system",
          content:
            `You are a kind, honest tutor. A high school student just explained what they studied, in their own words. Reply with ONE short sentence of feedback: name one thing they got right and, if needed, the single most important thing missing or wrong. No lists, no Markdown. Write in ${b.language === "ar" ? "Arabic" : /[\u0600-\u06FF]/.test(answer) ? "Arabic" : "English"} only.`,
        },
        { role: "user", content: `They studied: ${(b.studied ?? "").slice(0, 300)}\n\nTheir explanation: ${answer}` },
      ],
      400,
    );
    return NextResponse.json({ feedback });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
