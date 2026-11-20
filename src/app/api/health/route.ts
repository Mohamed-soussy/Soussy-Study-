import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ROUTES } from "@/lib/ai/engines";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const maxDuration = 60;

type Check = { id: string; ok: boolean | null; detail: string; fix?: string };

/** Which migration creates each table, so a missing one says what to run. */
const TABLES: [string, string][] = [
  ["profiles", "0001"], ["enrollments", "0001"], ["events", "0002"], ["files", "0002"], ["chats", "0002"], ["ai_usage", "0002"],
  ["whiteboard_lessons", "0003"], ["flashcards", "0004"], ["devices", "0004"], ["lessons", "0005"], ["connections", "0005"],
  ["community_notes", "0006"], ["reports", "0006"], ["xp_events", "0007"], ["study_days", "0007"], ["squads", "0007"], ["classes", "0007"],
];

async function timed<T>(p: Promise<T>, ms = 20000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("timed out")), ms))]);
}

/**
 * GET /api/health — the System check (moderators only on a live site): which keys are set,
 * which services answer, which migrations ran. Never returns a key's value.
 */
export async function GET() {
  const supabase = await getSupabaseServer();
  const checks: Check[] = [];
  if (supabase) {
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "moderator") return NextResponse.json({ error: "moderators_only" }, { status: 403 });
  }
  const env = (k: string) => Boolean(process.env[k]);
  const add = (id: string, ok: boolean | null, detail: string, fix?: string) => checks.push({ id, ok, detail, fix });

  // 1. Settings present (values are never shown)
  add("supabase", env("NEXT_PUBLIC_SUPABASE_URL") && env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY") ? "Accounts are on (normal mode)." : "Not set: the site runs in demo mode.", "Vercel → Settings → Environment Variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.");

  // 2. Database tables (= migrations)
  if (supabase) {
    const missing: string[] = [];
    for (const [t, m] of TABLES) {
      const { error } = await supabase.from(t).select("*", { count: "exact", head: true }).limit(1);
      if (error && /does not exist|schema cache|not find/i.test(error.message)) missing.push(`${t} (${m})`);
    }
    const migrations = [...new Set(missing.map((x) => x.match(/\((\d+)\)/)![1]))];
    add("migrations", missing.length === 0, missing.length ? `Missing tables: ${missing.join(", ")}` : "All tables from 0001–0007 exist.", missing.length ? `Run supabase/migrations/${migrations.join(", ")} in Supabase → SQL Editor.` : undefined);
    const { error: gradeErr } = await supabase.from("profiles").select("grade").limit(1);
    add("migration0008", !gradeErr, gradeErr ? "The grade column isn't there yet." : "Grade-first onboarding is ready.", gradeErr ? "Run supabase/migrations/0008_grades.sql." : undefined);
  }

  // 3. Service role key (server-only features)
  if (!env("SUPABASE_SERVICE_ROLE_KEY")) add("serviceRole", false, "Not set.", "Vercel: SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API → service_role). Needed for the shared whiteboard cache, note approvals, guardian links, parent view, account deletion and Teams.");
  else {
    try {
      const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
      const { error } = await timed(Promise.resolve(admin.from("profiles").select("id", { head: true, count: "exact" })));
      const { data: buckets } = await admin.storage.listBuckets();
      const names = (buckets ?? []).map((b) => b.name);
      const needed = ["vault", "community", "core"].filter((b) => !names.includes(b));
      add("serviceRole", !error && !needed.length, error ? `Rejected: ${error.message}` : needed.length ? `Storage buckets missing: ${needed.join(", ")}` : "Works; storage buckets ready.", error ? "Copy the service_role key again (not the anon key)." : needed.length ? "Run migrations 0002, 0006 and 0007." : undefined);
    } catch (e) {
      add("serviceRole", false, e instanceof Error ? e.message : "Failed.");
    }
  }

  // 4. Gemini (whiteboard lessons, resource summaries)
  if (!env("GEMINI_API_KEY")) add("gemini", false, "GEMINI_API_KEY not set: the whiteboard can't make new lessons.", "Get a key at aistudio.google.com → Get API key; add it in Vercel; redeploy.");
  else {
    const model = ROUTES.whiteboardLesson.models[0];
    try {
      const r = await timed(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
          body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with: ok" }] }], generationConfig: { maxOutputTokens: 5 } }),
        }),
      );
      const body = (await r.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
      add("gemini", r.ok, r.ok ? `Works (${model}).` : `Gemini said: ${body.error?.status ?? r.status} ${body.error?.message ?? ""}`.slice(0, 300), r.ok ? undefined : r.status === 400 || r.status === 403 ? "The key is wrong or for the wrong project: make a new one at aistudio.google.com (it starts with AIza), paste it into Vercel, redeploy." : r.status === 429 ? "Free-tier limit reached for now; try later." : "Try again later.");
    } catch (e) {
      add("gemini", false, e instanceof Error ? e.message : "No answer.");
    }
  }

  // 5. Groq (everything personal)
  if (!env("GROQ_API_KEY")) add("groq", false, "GROQ_API_KEY not set: chat, solver, lessons and most AI features are off.", "console.groq.com → API Keys; add in Vercel; redeploy.");
  else {
    try {
      const r = await timed(fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }));
      const j = (await r.json().catch(() => ({}))) as { data?: { id: string }[]; error?: { message?: string } };
      const ids = (j.data ?? []).map((m) => m.id);
      const need = [...ROUTES.chat.models, ...ROUTES.transcribe.models].filter((m) => !ids.includes(m));
      add("groq", r.ok && !need.length, r.ok ? (need.length ? `Works, but these models aren't available: ${need.join(", ")}` : "Works; all models available.") : `Groq said: ${j.error?.message ?? r.status}`, r.ok ? undefined : "Make a new key at console.groq.com, add it in Vercel, redeploy.");
    } catch (e) {
      add("groq", false, e instanceof Error ? e.message : "No answer.");
    }
  }

  // 6. Tavily (resource finder)
  if (!env("TAVILY_API_KEY")) add("tavily", false, "Not set: the resource finder shows demo cards.", "tavily.com → API key → Vercel TAVILY_API_KEY → redeploy.");
  else {
    try {
      const r = await timed(fetch("https://api.tavily.com/search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` }, body: JSON.stringify({ query: "Khan Academy photosynthesis", max_results: 1 }) }));
      add("tavily", r.ok, r.ok ? "Works." : `Tavily said: HTTP ${r.status}`, r.ok ? undefined : "Check the key at app.tavily.com.");
    } catch (e) {
      add("tavily", false, e instanceof Error ? e.message : "No answer.");
    }
  }

  // 7. Microsoft and background sync (optional)
  add("microsoft", env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET") ? true : null, env("MS_CLIENT_ID") && env("MS_CLIENT_SECRET") ? "Connect Microsoft is set up." : "Optional: not set up (Connect Microsoft shows demo data).", "Register an app in Microsoft Entra (steps in .env.example): MS_CLIENT_ID, MS_CLIENT_SECRET.");
  add("level3", env("MS_LEVEL3") && env("CRON_SECRET") ? true : null, env("MS_LEVEL3") ? "Teams Level 3 is on." : "Optional: off until KiS IT approves.", "After IT approval: MS_LEVEL3=1, CRON_SECRET, and the cron block at the end of migration 0006.");
  return NextResponse.json({ checks, at: new Date().toISOString() });
}
