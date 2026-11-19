import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toIcs } from "@/lib/calendar/logic";
import type { CalendarEvent } from "@/lib/data/types";
import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";

/**
 * GET /api/ics/<token> — private calendar feed (section 5, "Sync out").
 * Google Calendar, Outlook and Apple Calendar subscribe to this link.
 * The secret token is the only key; students can reset it in the calendar.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/, "");
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(clean)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("ics_feed", { token: clean });
  if (error) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new Response(toIcs((data ?? []) as CalendarEvent[]), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="soussy-study.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
}
