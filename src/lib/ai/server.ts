import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { engineConfigured, type Engine } from "./engines";

/** New AI generations per student per day (section 1A: generous, no paywall). */
export const DAILY_AI_LIMIT = 60;

export function aiNotConnected(engine: Engine) {
  const name = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", huggingface: "HUGGINGFACE_ACCESS_TOKEN" }[engine];
  return NextResponse.json({ error: "ai_not_connected", message: `The AI isn't connected yet. Add ${name} to the server settings.` }, { status: 503 });
}

/** Returns a 503 response if the engine has no key, else null. */
export function requireEngine(engine: Engine) {
  return engineConfigured(engine) ? null : aiNotConnected(engine);
}

/**
 * Checks the student is signed in (when accounts are on) and counts one AI use.
 * Returns an error response to send back, or null to continue.
 */
export async function guardAi(): Promise<NextResponse | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null; // demo mode: no accounts, no counting
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const { data, error } = await supabase.rpc("bump_ai_usage");
  // Invites add to the allowance (migration 0007); older databases use the base limit.
  const limit = typeof data === "number" && data > DAILY_AI_LIMIT ? ((await supabase.rpc("my_ai_limit")).data as number | null) ?? DAILY_AI_LIMIT : DAILY_AI_LIMIT;
  if (!error && typeof data === "number" && data > limit) {
    return NextResponse.json(
      {
        error: "daily_limit",
        message: "You've used today's AI allowance. Your files, calendar and saved lessons still work, and it resets tomorrow.",
      },
      { status: 429 },
    );
  }
  return null;
}

/** Signed-in check without counting AI use (for cached content). */
export async function requireUser(): Promise<NextResponse | null> {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? null : NextResponse.json({ error: "signed_out" }, { status: 401 });
}
