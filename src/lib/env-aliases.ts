/**
 * Accept key names typed by hand in Vercel (e.g. "SupabaseURL", "Grokapikey") as well
 * as the exact names the code reads. Names are compared without case, spaces or "_".
 */
const ALIASES: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ["supabaseurl", "supabaseprojecturl", "nextpublicsupabaseurl"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["supabaseanonkey", "supabaseanon", "supabasepublickey", "supabasepublishablekey", "nextpublicsupabaseanonkey"],
  SUPABASE_SERVICE_ROLE_KEY: ["supabaseservicerolekey", "supabaseseriverolekey", "supabaseservicekey", "servicerolekey", "supabaseservicerole"],
  GROQ_API_KEY: ["groqapikey", "grokapikey", "groqkey", "grokkey"],
  GEMINI_API_KEY: ["gemimikey", "gemmikey", "gemniapikey", "geminiapikey", "geminikey", "googleapikey", "googleaistudiokey", "geminiaikey"],
  TAVILY_API_KEY: ["tavilyapikey", "tavilykey"],
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: ["turnstilesitekey", "turnstilekey", "cloudflaresitekey", "captchasitekey", "sitekey", "turnstile"],
  SAPLING_API_KEY: ["saplingapikey", "saplingkey", "aidetectorkey"],
  MISTRAL_API_KEY: ["mistralapikey", "mistralkey", "mistralaikey"],
};

const CONTAINS: Record<string, string> = { GEMINI_API_KEY: "gemini", GROQ_API_KEY: "groq", MISTRAL_API_KEY: "mistral", TAVILY_API_KEY: "tavily" };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Copies a hand-named variable onto the exact name when the exact one is missing. */
export function applyEnvAliases(env: Record<string, string | undefined> = process.env): void {
  const byNorm = new Map(Object.keys(env).map((k) => [norm(k), k]));
  for (const [exact, aliases] of Object.entries(ALIASES)) {
    if (env[exact]?.trim()) continue;
    // The exact name typed without "_" or in another case (e.g. NEXTPUBLICTURNSTILESITEKEY) also counts.
    let found = [norm(exact), ...aliases].map((a) => byNorm.get(a)).find((k) => k && env[k]?.trim());
    // Last resort: any variable whose name contains the service's name (e.g. "Gemini", "my gemini").
    const word = CONTAINS[exact];
    if (!found && word) found = [...byNorm.entries()].find(([n, k]) => n.includes(word) && env[k]?.trim())?.[1];
    if (found) env[exact] = env[found]!.trim();
  }
}
