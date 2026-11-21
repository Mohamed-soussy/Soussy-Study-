/**
 * Supabase settings come from environment variables (see .env.example).
 * When the anon key is missing the app runs in clearly labeled DEMO MODE:
 * everything is saved in this browser only, and nothing reaches a server.
 */
/** Keeps only "https://<project>.supabase.co": a pasted "/rest/v1/" or trailing slash breaks sign-in. */
export function cleanSupabaseUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    return new URL(v.startsWith("http") ? v : `https://${v}`).origin;
  } catch {
    return v.replace(/\/+$/, "");
  }
}

export const SUPABASE_URL = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
