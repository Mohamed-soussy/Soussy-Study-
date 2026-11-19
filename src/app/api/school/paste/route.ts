import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { PASTE_SCHEMA, PASTE_SYSTEM, type PasteOut } from "@/prompts/lesson.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/school/paste — finds tasks and dates in text pasted from Teams, email or a
 * class page (section 10.1, Level 1). Body: { text, today: "YYYY-MM-DD", weekday }.
 * The student's text is personal, so Groq.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { text?: string; today?: string; weekday?: string };
  const text = (b.text ?? "").slice(0, 12000);
  if (text.trim().length < 10) return NextResponse.json({ error: "too_short" }, { status: 400 });
  try {
    const out = await groqJSON<PasteOut>(ROUTES.schoolParse, {
      name: "school_items",
      schema: PASTE_SCHEMA,
      maxTokens: 2500,
      messages: [
        { role: "system", content: PASTE_SYSTEM },
        { role: "user", content: `Today is ${b.today ?? new Date().toISOString().slice(0, 10)} (${b.weekday ?? ""}).\n\n<pasted>\n${text}\n</pasted>` },
      ],
    });
    return NextResponse.json({ items: out.items.filter((i) => i.title.trim() && i.confidence >= 0.4).slice(0, 40) });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
