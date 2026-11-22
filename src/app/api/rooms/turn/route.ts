import { NextResponse } from "next/server";
import { requireUser } from "@/lib/ai/server";

export const dynamic = "force-dynamic";

/**
 * TURN relay for live study-room video on strict networks (optional).
 * - Cloudflare Realtime TURN (free monthly allowance): CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN.
 * - Or any TURN server: TURN_URLS (comma separated), TURN_USERNAME, TURN_CREDENTIAL.
 * Without either, rooms still connect on most home networks using free STUN.
 */
export async function GET() {
  const signedOut = await requireUser();
  if (signedOut) return signedOut;
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (keyId && token) {
    try {
      const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 4 * 3600 }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const j = (await r.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
        const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
        return NextResponse.json({ iceServers: list });
      }
    } catch {
      /* fall through */
    }
  }
  const urls = process.env.TURN_URLS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (urls?.length) return NextResponse.json({ iceServers: [{ urls, username: process.env.TURN_USERNAME ?? "", credential: process.env.TURN_CREDENTIAL ?? "" }] });
  return NextResponse.json({ iceServers: [] });
}
