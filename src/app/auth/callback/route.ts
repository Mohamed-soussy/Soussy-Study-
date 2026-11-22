import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * Google / Microsoft / email links land here. Exchanges the one-time code for a
 * session cookie, then opens the app. Any problem goes back to /sign-in with a
 * readable reason instead of failing silently.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/home";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/home";
  const fail = (msg: string) => NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(msg)}`);

  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) return fail(providerError);

  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.redirect(`${origin}/sign-in`);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // The code was already used (double tap / reload) but the session exists: carry on.
    const { data } = await supabase.auth.getUser();
    if (data.user) return NextResponse.redirect(`${origin}${next}`);
    return fail(/code verifier|both auth code and code verifier/i.test(error.message) ? "Please start sign-in again on this same browser and website address." : error.message);
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : next}`);
    return fail(error.message);
  }
  return NextResponse.redirect(`${origin}/sign-in`);
}
