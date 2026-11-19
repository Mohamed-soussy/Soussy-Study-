import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";

export const runtime = "nodejs";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["front", "back"],
        properties: { front: { type: "string" }, back: { type: "string" } },
      },
    },
  },
} as const;

/**
 * POST /api/cards — flashcards from the student's notes, a lesson or a chat (section 12.1).
 * Personal content, so Groq. Body: { text, count?, subject?, language? }
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { text?: string; count?: number; subject?: string; language?: string };
  const text = (b.text ?? "").slice(0, 14000);
  if (text.trim().length < 20) return NextResponse.json({ error: "too_short" }, { status: 400 });
  const count = Math.min(30, Math.max(4, Number(b.count) || 12));
  try {
    const out = await groqJSON<{ cards: { front: string; back: string }[] }>(ROUTES.cards, {
      name: "flashcards",
      schema: SCHEMA,
      maxTokens: 2500,
      messages: [
        {
          role: "user",
          content: `Make ${count} flashcards from these study notes${b.subject ? ` (${b.subject})` : ""}.
Rules: one fact or idea per card; the front is a short question or term; the back is a short, exact answer (under 25 words); use only facts in the notes; plain text with Unicode math (no LaTeX). Language: ${b.language === "ar" ? "Arabic" : "the language of the notes"}.

<notes>
${text}
</notes>`,
        },
      ],
    });
    const cards = out.cards
      .map((c) => ({ front: c.front.trim().slice(0, 300), back: c.back.trim().slice(0, 500) }))
      .filter((c) => c.front && c.back)
      .slice(0, count);
    return NextResponse.json({ cards });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
