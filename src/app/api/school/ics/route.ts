import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/ai/server";
import { parseIcs } from "@/lib/school/ics";
import { FetchRefused, safeFetchText } from "@/lib/school/safe-fetch";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/school/ics — reads a calendar feed link (section 10.1, Level 1).
 * Body: { url }. Returns the events from 30 days ago onward; the browser decides what to keep.
 * No AI involved, so it doesn't count toward the daily allowance.
 */
export async function POST(req: NextRequest) {
  const blocked = await requireUser();
  if (blocked) return blocked;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || url.length > 2000) return NextResponse.json({ error: "bad_url", message: "Paste the calendar's link." }, { status: 400 });
  try {
    const text = await safeFetchText(url);
    if (!/BEGIN:VCALENDAR/i.test(text)) return NextResponse.json({ error: "not_ics", message: "That link isn't a calendar feed (.ics)." }, { status: 422 });
    const { name, events } = parseIcs(text);
    const from = Date.now() - 30 * 864e5;
    const to = Date.now() + 400 * 864e5;
    const keep = events.filter((e) => {
      const start = new Date(e.start).getTime();
      const last = e.repeatEveryDays ? (e.repeatUntil ? new Date(`${e.repeatUntil}T23:59:59`).getTime() : Infinity) : new Date(e.end ?? e.start).getTime();
      return last >= from && start <= to;
    });
    return NextResponse.json({ name, events: keep.slice(0, 1500), total: events.length });
  } catch (err) {
    const message = err instanceof FetchRefused ? err.message : err instanceof TypeError ? "That doesn't look like a valid link." : "Couldn't open that calendar link. Check it in a browser.";
    return NextResponse.json({ error: "fetch_failed", message }, { status: 422 });
  }
}
