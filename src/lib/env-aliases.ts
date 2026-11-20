/**
 * Accept key names typed by hand in Vercel (e.g. "SupabaseURL", "Grokapikey") as well
 * as the exact names the code reads. Names are compared without case, spaces or "_".
 */
const ALIASES: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ["supabaseurl", "supabaseprojecturl", "nextpublicsupabaseurl"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["supabaseanonkey", "supabaseanon", "supabasepublickey", "supabasepublishablekey", "nextpublicsupabaseanonkey"],
  SUPABASE_SERVICE_ROLE_KEY: ["supabaseservicerolekey", "supabaseseriverolekey", "supabaseservicekey", "servicerolekey", "supabaseservicerole"],
  GROQ_API_KEY: ["groqapikey", "grokapikey", "groqkey", "grokkey"],
  GEMINI_API_KEY: ["geminiapikey", "geminikey", "googleapikey", "googleaistudiokey", "geminiaikey"],
  TAVILY_API_KEY: ["tavilyapikey", "tavilykey"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Copies a hand-named variable onto the exact name when the exact one is missing. */
export function applyEnvAliases(env: Record<string, string | undefined> = process.env): void {
  const byNorm = new Map(Object.keys(env).map((k) => [norm(k), k]));
  for (const [exact, aliases] of Object.entries(ALIASES)) {
    if (env[exact]?.trim()) continue;
    const found = aliases.map((a) => byNorm.get(a)).find((k) => k && env[k]?.trim());
    if (found) env[exact] = env[found]!.trim();
  }
}
