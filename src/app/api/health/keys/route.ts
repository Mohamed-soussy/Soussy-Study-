import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public yes/no: which keys this deployment has. Never returns a value. */
export function GET() {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  return NextResponse.json({
    supabase: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
    groq: has("GROQ_API_KEY"),
    gemini: has("GEMINI_API_KEY"),
    mistral: has("MISTRAL_API_KEY"),
    tavily: has("TAVILY_API_KEY"),
    // Names only (never values) of variables that mention Google/Gemini, to spot a misnamed key.
    geminiLikeNames: Object.keys(process.env).filter((k) => /gem|google|aistudio/i.test(k)),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
