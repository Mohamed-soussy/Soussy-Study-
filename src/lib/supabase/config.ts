/**
 * Supabase settings come from environment variables (see .env.example).
 * When the anon key is missing the app runs in clearly labeled DEMO MODE:
 * everything is saved in this browser only, and nothing reaches a server.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
