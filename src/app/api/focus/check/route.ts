import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, geminiJSON, ROUTES } from "@/lib/ai/engines";
import { requireEngine } from "@/lib/ai/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/focus/check — OPT-IN cloud check of one small webcam snapshot (section 12A).
 * Only called after the student switched on "Cloud checks" and agreed that the photo
 * goes to Google Gemini's free tier. The image is not stored by Soussy Study.
 * Kept tiny on purpose: 256 px JPEG, low media resolution, minimal thinking, ~10-token answer.
 */

const MIN_GAP_MS = 60_000; // at most one check a minute per student
const DAILY_MAX = 300;
const last = new Map<string, { at: number; day: string; count: number }>();

const SCHEMA = {
  type: "OBJECT",
  required: ["state"],
  properties: { state: { type: "STRING", enum: ["present", "absent", "phone", "drowsy", "unclear"] } },
};

export async function POST(req: NextRequest) {
  const missing = requireEngine("gemini");
  if (missing) return missing;

  let who = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const supabase = await getSupabaseServer();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
    who = user.id;
  }

  const today = new Date().toISOString().slice(0, 10);
  const rec = last.get(who);
  const now = Date.now();
  if (rec && now - rec.at < MIN_GAP_MS) return NextResponse.json({ error: "too_soon" }, { status: 429 });
  if (rec && rec.day === today && rec.count >= DAILY_MAX) return NextResponse.json({ error: "daily_limit" }, { status: 429 });
  last.set(who, { at: now, day: today, count: rec?.day === today ? rec.count + 1 : 1 });

  const { image, consent } = (await req.json()) as { image?: string; consent?: boolean };
  if (consent !== true) return NextResponse.json({ error: "no_consent" }, { status: 403 });
  if (!image || image.length > 200_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "bad_image" }, { status: 400 });

  try {
    const out = await geminiJSON<{ state: string }>(ROUTES.focusSnapshot, {
      prompt:
        "Webcam frame from a study focus app. Classify the student: present (at the desk, looking at the screen or writing), absent (no person), phone (holding or looking at a phone), drowsy (eyes closed, head down sleeping), unclear.",
      schema: SCHEMA,
      images: [{ mime: "image/jpeg", base64: image }],
      maxOutputTokens: 30,
      minimalThinking: true,
      timeoutMs: 20000,
    });
    return NextResponse.json({ state: out.state });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
