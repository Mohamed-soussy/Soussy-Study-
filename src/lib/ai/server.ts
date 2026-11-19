import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/**
 * One wrapper for every AI call (section 15), so models can change in one place.
 * Model choice follows section 1A: the strongest model only where it matters
 * (chat, explanations), the cheapest capable model for tagging, dates and summaries.
 */
export const MODELS = {
  /** Chat, study help, hard problems. Named in the Master Build Prompt, section 15. */
  main: "claude-sonnet-5-5",
  /** Tagging, date extraction, summaries, reading images. */
  small: "claude-haiku-5-5",
} as const;

/** New AI generations per student per day (section 1A: generous, no paywall). */
export const DAILY_AI_LIMIT = 60;

let client: Anthropic | null = null;

/** Null when ANTHROPIC_API_KEY is not set; callers then answer with a clear "not connected" error. */
export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export function aiNotConnected() {
  return NextResponse.json(
    { error: "ai_not_connected", message: "The AI isn't connected yet. Add ANTHROPIC_API_KEY to the server settings." },
    { status: 503 },
  );
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
  if (!error && typeof data === "number" && data > DAILY_AI_LIMIT) {
    return NextResponse.json(
      {
        error: "daily_limit",
        message: "You've used today's AI allowance. Your files, calendar and saved answers still work, and it resets tomorrow.",
      },
      { status: 429 },
    );
  }
  return null;
}

/** Friendly text for API failures; never leaks keys or stack traces. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "The AI is busy right now. Try again in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The AI key on the server isn't valid.";
  if (err instanceof Anthropic.BadRequestError) return "The AI couldn't read that request.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI. Check the connection.";
  if (err instanceof Anthropic.APIError) return `The AI had a problem (${err.status}). Try again.`;
  return "Something went wrong. Try again.";
}
