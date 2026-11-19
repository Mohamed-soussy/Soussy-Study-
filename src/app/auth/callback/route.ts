import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Google / Microsoft / email-verification links land here.
 * Exchanges the one-time code for a session cookie, then opens the app.
 * The app shell sends students who haven't finished onboarding to /onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const supabase = await getSupabaseServer();

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/home`);
  }
  return NextResponse.redirect(`${origin}/sign-in`);
}
