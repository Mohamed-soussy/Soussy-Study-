import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { exchangeCode, graph, OAUTH_COOKIE, saveTokens } from "@/lib/school/microsoft";
import { unseal } from "@/lib/school/seal";

export const runtime = "nodejs";

/** Turns Microsoft's error codes into the few cases the Connections card explains. */
function reason(code: string | null, description: string | null): string {
  const d = description ?? "";
  if (/AADSTS65001|AADSTS90094|AADSTS90095|admin|approval|consent/i.test(d) || code === "consent_required") return "needs_approval";
  if (code === "access_denied") return "cancelled";
  return "failed";
}

/** GET /api/microsoft/callback — Microsoft sends the student back here after sign-in. */
export async function GET(req: NextRequest) {
  const done = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${q}#connections`, req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/microsoft" });
    return res;
  };
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return done(`ms_error=${reason(p.get("error"), p.get("error_description"))}`);

  const raw = req.cookies.get(OAUTH_COOKIE)?.value;
  let saved: { state: string; verifier: string; uid: string; scopes: string[]; at: number };
  try {
    saved = unseal(raw ?? "");
  } catch {
    return done("ms_error=expired");
  }
  if (!p.get("code") || p.get("state") !== saved.state || Date.now() - saved.at > 600_000) return done("ms_error=expired");

  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user || user.id !== saved.uid) return done("ms_error=expired");

  try {
    const tokens = await exchangeCode(p.get("code")!, saved.verifier, new URL("/api/microsoft/callback", req.url).toString(), saved.scopes);
    const me = await graph<{ mail?: string; userPrincipalName?: string; displayName?: string }>(tokens.access, "/me?$select=mail,userPrincipalName,displayName");
    await saveTokens(user.id, tokens);
    const account = me.mail ?? me.userPrincipalName ?? me.displayName ?? "";
    const hasAssignments = tokens.scopes.some((s) => /EduAssignments/i.test(s));
    const existing = await supabase.from("connections").select("id,settings").eq("provider", "microsoft").maybeSingle();
    const settings = { calendar: true, files: true, ...(existing.data?.settings ?? {}), assignments: hasAssignments };
    if (existing.data) await supabase.from("connections").update({ account, settings, last_error: null }).eq("id", existing.data.id);
    else await supabase.from("connections").insert({ provider: "microsoft", label: "Microsoft", account, settings });
    return done("connected=microsoft");
  } catch (err) {
    const e = err as Error & { code?: string };
    return done(`ms_error=${reason(e.code ?? null, e.message)}`);
  }
}
