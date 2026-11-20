import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqText, ROUTES } from "@/lib/ai/engines";
import { guardAi, requireEngine } from "@/lib/ai/server";
import { QUESTIONS_PROMPT } from "@/prompts/resources.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/resources/questions — "Make questions from this": ORIGINAL practice questions in
 * the style of a resource, never copied (section 9.1). Body: { course, unit, title, summary }.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { course?: string; unit?: string; title?: string; summary?: string };
  try {
    const text = await groqText(
      ROUTES.coach,
      [{ role: "user", content: QUESTIONS_PROMPT({ course: (b.course ?? "").slice(0, 80), unit: (b.unit ?? "").slice(0, 120), title: (b.title ?? "").slice(0, 160), summary: (b.summary ?? "").slice(0, 600), count: 5 }) }],
      2200,
    );
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
