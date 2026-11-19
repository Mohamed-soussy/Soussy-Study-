import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, EngineError, groqText, ROUTES } from "@/lib/ai/engines";
import { requireEngine, requireUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/lessons/slide — reads the text on one video frame of a lesson (a slide or the
 * whiteboard) so it can sit next to the transcript at that time (section 11.2).
 * Body: { image: "data:image/jpeg;base64,..." }. Private, so Groq's vision model.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const blocked = await requireUser();
  if (blocked) return blocked;
  const { image } = (await req.json()) as { image?: string };
  if (!image?.startsWith("data:image/") || image.length > 1_500_000) return NextResponse.json({ error: "bad_image" }, { status: 400 });
  try {
    const text = await groqText(
      ROUTES.readImage,
      [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            {
              type: "text",
              text: "This is a frame from a recorded class. If it shows a slide, document or whiteboard, copy its text, headings and formulas exactly (formulas in plain Unicode), keeping the line order. If it only shows people, a room or a blank screen, reply with exactly: NONE",
            },
          ],
        },
      ],
      700,
    );
    const clean = text.trim();
    return NextResponse.json({ text: /^NONE\.?$/i.test(clean) ? "" : clean.slice(0, 2000) });
  } catch (err) {
    const status = err instanceof EngineError && err.code === "rate_limited" ? 429 : 502;
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err), retryAfter: err instanceof EngineError ? err.retryAfter : 0 }, { status });
  }
}
