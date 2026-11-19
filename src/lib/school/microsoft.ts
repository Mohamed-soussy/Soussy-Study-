import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { seal, sealingConfigured, unseal } from "./seal";

/**
 * Microsoft sign-in (section 10, Level 2) with OAuth 2.0 + PKCE and delegated permissions:
 * the student signs in with their school account and Soussy Study reads only what they can
 * see. It never writes to Teams, Outlook or OneDrive.
 */

/** Holds the sign-in state and PKCE verifier for ten minutes (sealed, httpOnly). */
export const OAUTH_COOKIE = "soussy_ms_oauth";

/** Level 2 base permissions: profile, Outlook calendar (class meetings), OneDrive files. */
export const BASE_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.Read", "Files.Read"];
/** Asked for separately: many schools only allow it after IT approves the app. */
export const ASSIGNMENT_SCOPES = ["EduAssignments.ReadBasic"];

export function msConfig() {
  const clientId = process.env.MS_CLIENT_ID ?? "";
  const secret = process.env.MS_CLIENT_SECRET ?? "";
  // "organizations" = any school or work account. A school can pin its own tenant id.
  const tenant = process.env.MS_TENANT_ID || "organizations";
  return { clientId, secret, tenant, configured: Boolean(clientId && secret && sealingConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

/** What the setup still needs, in plain words, for the Connections card. */
export function msMissing(): string[] {
  const out: string[] = [];
  if (!process.env.MS_CLIENT_ID) out.push("MS_CLIENT_ID");
  if (!process.env.MS_CLIENT_SECRET) out.push("MS_CLIENT_SECRET");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) out.push("SUPABASE_SERVICE_ROLE_KEY");
  return out;
}

export function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(16).toString("base64url") };
}

const authority = () => `https://login.microsoftonline.com/${msConfig().tenant}/oauth2/v2.0`;

export function authorizeUrl(a: { redirectUri: string; scopes: string[]; state: string; challenge: string; loginHint?: string }) {
  const q = new URLSearchParams({
    client_id: msConfig().clientId,
    response_type: "code",
    redirect_uri: a.redirectUri,
    response_mode: "query",
    scope: a.scopes.join(" "),
    state: a.state,
    code_challenge: a.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  if (a.loginHint) q.set("login_hint", a.loginHint);
  return `${authority()}/authorize?${q}`;
}

export interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number; // ms
  scopes: string[];
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const { clientId, secret } = msConfig();
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    const err = new Error(data.error_description ?? data.error ?? `HTTP ${res.status}`) as Error & { code?: string };
    err.code = data.error;
    throw err;
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token ?? body.refresh_token ?? "",
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    scopes: (data.scope ?? "").split(" ").filter(Boolean),
  };
}

export const exchangeCode = (code: string, verifier: string, redirectUri: string, scopes: string[]) =>
  tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, scope: scopes.join(" ") });

/* ---------- encrypted storage (service role only) ---------- */

export async function saveTokens(userId: string, t: Tokens) {
  const { error } = await admin()
    .from("connection_secrets")
    .upsert({ user_id: userId, provider: "microsoft", sealed: seal(t), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function deleteTokens(userId: string) {
  await admin().from("connection_secrets").delete().eq("user_id", userId).eq("provider", "microsoft");
}

/** A working access token, refreshed (and re-saved) when it has expired. */
export async function accessToken(userId: string): Promise<Tokens | null> {
  const { data } = await admin().from("connection_secrets").select("sealed").eq("user_id", userId).eq("provider", "microsoft").maybeSingle();
  if (!data?.sealed) return null;
  const t = unseal<Tokens>(data.sealed);
  if (t.expiresAt > Date.now()) return t;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, scope: t.scopes.filter((s) => !["openid", "profile", "email"].includes(s)).join(" ") || BASE_SCOPES.join(" ") });
  await saveTokens(userId, fresh);
  return fresh;
}

/* ---------- Microsoft Graph ---------- */

export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function graph<T>(token: string, path: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    throw new GraphError(res.status, body.error?.code ?? "", body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Follows @odata.nextLink up to a few pages. */
export async function graphAll<T>(token: string, path: string, headers: Record<string, string> = {}, pages = 5): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  for (let i = 0; next && i < pages; i++) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(token, next, headers);
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

export const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
