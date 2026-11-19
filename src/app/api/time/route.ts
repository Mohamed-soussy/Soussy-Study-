import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/time — server time, so linked devices agree on the timer (section 4A). */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
