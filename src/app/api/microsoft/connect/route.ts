import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ASSIGNMENT_SCOPES, authorizeUrl, BASE_SCOPES, msConfig, OAUTH_COOKIE, pkce } from "@/lib/school/microsoft";
import { seal } from "@/lib/school/seal";
import { level3, LEVEL3_SCOPES } from "@/lib/school/ms-fetch";

export const runtime = "nodejs";

/**
 * GET /api/microsoft/connect — starts "Connect Microsoft" (section 10, Level 2).
 * ?assignments=1 also asks for Teams assignments (EduAssignments.ReadBasic).
 */
export async function GET(req: NextRequest) {
  if (!msConfig().configured) return NextResponse.redirect(new URL("/settings?ms_error=not_configured#connections", req.url));
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.redirect(new URL("/sign-in", req.url));

  const wantAssignments = req.nextUrl.searchParams.get("assignments") === "1";
  // Once the school approves (Level 3), ask for assignments and class transcripts too.
  const scopes = [...BASE_SCOPES, ...(wantAssignments || level3() ? ASSIGNMENT_SCOPES : []), ...(level3() ? LEVEL3_SCOPES : [])];
  const { verifier, challenge, state } = pkce();
  const redirectUri = new URL("/api/microsoft/callback", req.url).toString();
  const res = NextResponse.redirect(authorizeUrl({ redirectUri, scopes, state, challenge, loginHint: req.nextUrl.searchParams.get("hint") ?? undefined }));
  // State, PKCE verifier and who started it, sealed in a short-lived cookie only the server can read.
  res.cookies.set(OAUTH_COOKIE, seal({ state, verifier, uid: user.id, scopes, at: Date.now() }), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/microsoft",
    maxAge: 600,
  });
  return res;
}
