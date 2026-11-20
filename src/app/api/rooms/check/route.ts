import { NextResponse, type NextRequest } from "next/server";
import { engineConfigured, groqText, ROUTES } from "@/lib/ai/engines";
import { requireUser } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const REASONS = ["nudity", "smoking", "weapons", "gesture", "personal"] as const;

/**
 * POST /api/rooms/check — the server spot check for study rooms (section 12A.5): about once a
 * minute, a low-resolution snapshot is checked by a vision model. The image is not stored.
 * Body: { image: data URL }. Returns { safe, reason }. Private images of students, so Groq.
 */
export async function POST(req: NextRequest) {
  const blocked = await requireUser();
  if (blocked) return blocked;
  const { image } = (await req.json().catch(() => ({}))) as { image?: string };
  if (!image?.startsWith("data:image/jpeg") || image.length > 120_000) return NextResponse.json({ error: "bad_image" }, { status: 400 });
  // Without the model, the on-device checks and reports still protect the room.
  if (!engineConfigured("groq")) return NextResponse.json({ safe: true, reason: null, checked: false });
  try {
    const answer = await groqText(
      ROUTES.readImage,
      [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: image } },
            {
              type: "text",
              text: `This is a small webcam snapshot from a teenagers' silent study room (the background may be blurred). Reply with exactly one word:
SAFE if a student is studying, or the desk or an empty seat is shown;
nudity if there is nudity, underwear or sexual content;
smoking if there is smoking, vaping, drugs or alcohol;
weapons if there is a weapon;
gesture if there is a rude gesture or an offensive symbol or sign;
personal if an ID card, address, phone number or similar personal information is readable.`,
            },
          ],
        },
      ],
      10,
    );
    const word = answer.trim().toLowerCase().replace(/[^a-z]/g, "");
    const reason = REASONS.find((r) => word.startsWith(r)) ?? null;
    return NextResponse.json({ safe: !reason, reason, checked: true });
  } catch {
    return NextResponse.json({ safe: true, reason: null, checked: false });
  }
}
