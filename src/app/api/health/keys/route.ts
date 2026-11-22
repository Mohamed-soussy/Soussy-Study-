import { NextResponse } from "next/server";
import { applyEnvAliases } from "@/lib/env-aliases";

export const dynamic = "force-dynamic";

/** Asks a provider a tiny question; returns only the HTTP status (never keys or answers). */
async function ping(url: string, init: RequestInit): Promise<number> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return r.status;
  } catch {
    return 0;
  }
}

/** Public yes/no: which keys this deployment has, and whether each provider accepts its key. */
export async function GET(req: Request) {
  applyEnvAliases();
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const live = new URL(req.url).searchParams.has("live");
  const out: Record<string, unknown> = {
    supabase: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
    groq: has("GROQ_API_KEY"),
    gemini: has("GEMINI_API_KEY"),
    mistral: has("MISTRAL_API_KEY"),
    tavily: has("TAVILY_API_KEY"),
    turnstileSiteKey: has("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
  if (live) {
    const [groq, mistral, gemini] = await Promise.all([
      has("GROQ_API_KEY") ? ping("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}` } }) : -1,
      has("MISTRAL_API_KEY") ? ping("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY!.trim()}` } }) : -1,
      has("GEMINI_API_KEY") ? ping("https://generativelanguage.googleapis.com/v1beta/models", { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!.trim() } }) : -1,
    ]);
    out.liveStatus = { groq, mistral, gemini };
  }
  return NextResponse.json(out);
}
