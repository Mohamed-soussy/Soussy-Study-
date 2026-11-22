import { NextResponse, type NextRequest } from "next/server";
import { guardAi } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ai-detect — how likely a text is AI-written (Sapling, free developer tier).
 * Long texts are checked in ~2,000-character parts and averaged by length.
 * Detectors make mistakes (they can flag human writing), so the result is a hint, never proof.
 */
export async function POST(req: NextRequest) {
  const key = process.env.SAPLING_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "not_configured", message: "The AI detector isn't set up yet (SAPLING_API_KEY)." }, { status: 503 });
  const blocked = await guardAi();
  if (blocked) return blocked;
  const { text } = (await req.json()) as { text?: string };
  const clean = (text ?? "").trim().slice(0, 20000);
  if (clean.split(/\s+/).length < 40) return NextResponse.json({ error: "too_short", message: "Paste at least 40 words." }, { status: 400 });

  const parts = clean.match(/[\s\S]{1,1990}(?=\s|$)/g) ?? [clean];
  let weighted = 0;
  let total = 0;
  const sentences: { sentence: string; score: number }[] = [];
  for (const part of parts.slice(0, 10)) {
    const r = await fetch("https://api.sapling.ai/api/v1/aidetect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, text: part, sent_scores: true }),
      signal: AbortSignal.timeout(20000),
    }).catch(() => null);
    if (!r?.ok) return NextResponse.json({ error: "failed", message: r?.status === 401 ? "The detector key is wrong." : "The detector isn't answering. Try again." }, { status: 502 });
    const j = (await r.json()) as { score: number; sentence_scores?: { sentence: string; score: number }[] };
    weighted += j.score * part.length;
    total += part.length;
    sentences.push(...(j.sentence_scores ?? []));
  }
  return NextResponse.json({
    score: total ? weighted / total : 0,
    flagged: sentences.filter((s) => s.score >= 0.8).slice(0, 12).map((s) => s.sentence.slice(0, 300)),
    checkedChars: total,
  });
}
