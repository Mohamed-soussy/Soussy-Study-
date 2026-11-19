import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, EngineError, groqTranscribe } from "@/lib/ai/engines";
import { requireEngine, requireUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Each piece is about 2 minutes of 16 kHz mono WAV (~3.6 MB), under the 4.5 MB request limit. */
const MAX_BYTES = 4.4 * 1024 * 1024;

/**
 * POST /api/lessons/transcribe — one piece of a lesson recording → timed text (section 11.2).
 * Form: audio (WAV), offset (seconds into the lesson), hint (subject words), language (optional).
 * Private audio, so Groq Whisper only. The browser cuts the recording into pieces; this
 * counts once per lesson (in /api/lessons/analyze), not per piece.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await requireUser();
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1000) return NextResponse.json({ error: "no_audio" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "too_big" }, { status: 413 });
  const offset = Math.max(0, Number(form?.get("offset")) || 0);
  const language = String(form?.get("language") ?? "");
  try {
    const out = await groqTranscribe(audio, {
      prompt: String(form?.get("hint") ?? ""),
      language: ["en", "ar"].includes(language) ? language : undefined,
    });
    return NextResponse.json({
      language: out.language,
      segments: out.segments.map((g) => ({ ...g, s: Math.round((g.s + offset) * 10) / 10, e: Math.round((g.e + offset) * 10) / 10 })),
    });
  } catch (err) {
    const status = err instanceof EngineError && err.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err), retryAfter: err instanceof EngineError ? err.retryAfter : 0 }, { status });
  }
}
