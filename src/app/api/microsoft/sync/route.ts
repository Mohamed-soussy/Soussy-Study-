import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { accessToken, msConfig } from "@/lib/school/microsoft";
import { fetchMicrosoft, importTranscripts, level3, type Want } from "@/lib/school/ms-fetch";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/microsoft/sync — reads the student's Outlook calendar, Teams assignments and
 * OneDrive files (section 10, Level 2), plus class transcripts once the school approves
 * Level 3. Read-only. Body: { calendar?, assignments?, files? } toggles. The browser turns
 * the result into calendar items (one shared connector layer).
 */
export async function POST(req: NextRequest) {
  if (!msConfig().configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const want = (await req.json().catch(() => ({}))) as Want;

  let token: string;
  try {
    const t = await accessToken(user.id);
    if (!t) return NextResponse.json({ error: "not_connected" }, { status: 404 });
    token = t.access;
  } catch {
    // Refresh token expired or revoked (password change, IT removed the app): sign in again.
    return NextResponse.json({ error: "reconnect", message: "Microsoft sign-in expired. Connect again." }, { status: 401 });
  }
  const data = await fetchMicrosoft(token, want);
  const transcripts = level3()
    ? await importTranscripts(
        token,
        supabase,
        user.id,
        data.calendar.items.filter((e) => e.online && new Date(e.start).getTime() < Date.now()).map((e) => ({ subject: e.subject, start: e.start, joinUrl: e.joinUrl })),
      )
    : null;
  return NextResponse.json({ ...data, transcripts });
}
