import { NextResponse, type NextRequest } from "next/server";
import { engineErrorMessage, groqJSON, ROUTES } from "@/lib/ai/engines";
import { requireEngine } from "@/lib/ai/server";
import { admin } from "@/lib/school/microsoft";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CHECK_NOTE_SCHEMA, CHECK_NOTE_SYSTEM } from "@/prompts/resources.v1";
import type { AiCheck } from "@/lib/data/repo6";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Obvious personal data the AI might miss: phone numbers, emails, Saudi ID numbers. */
const PII = /\b(?:\+?966|0)5\d{8}\b|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\b[12]\d{9}\b/;

async function runCheck(n: { title: string; subject_name: string; unit: string; kind: string; body: string; image_path?: string | null }): Promise<AiCheck> {
  const check = await groqJSON<AiCheck>(ROUTES.community, {
    name: "note_check",
    schema: CHECK_NOTE_SCHEMA,
    maxTokens: 700,
    messages: [
      { role: "system", content: CHECK_NOTE_SYSTEM },
      { role: "user", content: `Filed under: ${n.subject_name}, unit "${n.unit}". Kind: ${n.kind}. Title: ${n.title}\n\n<note>\n${n.body.slice(0, 12000)}\n</note>` },
    ],
  });
  if (PII.test(n.body)) Object.assign(check, { personal_data: true, verdict: check.verdict === "reject" ? "reject" : "hold" });
  // An image the AI can't read in full always gets a human look first.
  if (n.image_path && check.verdict === "approve") Object.assign(check, { verdict: "hold", reason: "Thanks! A moderator will look at your image before it's shared." });
  return check;
}

/**
 * POST /api/community/check — the AI check every upload gets before it's shared (sections 9.2,
 * 14). Body: { noteId } for accounts, or { note } in demo mode. Approves, holds for a
 * moderator, or rejects with a kind reason. Student-written, so Groq.
 */
export async function POST(req: NextRequest) {
  const missing = requireEngine("groq");
  if (missing) return missing;
  const b = (await req.json()) as { noteId?: string; note?: { title: string; subject_name: string; unit: string; kind: string; body: string; image_path?: string | null } };
  const supabase = await getSupabaseServer();
  try {
    if (!supabase) {
      if (!b.note) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      return NextResponse.json({ check: await runCheck(b.note) });
    }
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
    // Read through the student's own access: only their own note can be checked.
    const { data: note } = await supabase.from("community_notes").select("*").eq("id", b.noteId ?? "").eq("user_id", user.id).maybeSingle();
    if (!note) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const check = await runCheck(note);
    const status = check.verdict === "approve" ? "approved" : check.verdict === "reject" ? "rejected" : "pending";
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) await admin().from("community_notes").update({ status, ai_check: check }).eq("id", note.id);
    else await supabase.from("community_notes").update({ ai_check: check }).eq("id", note.id); // stays pending for a moderator
    return NextResponse.json({ check, status: process.env.SUPABASE_SERVICE_ROLE_KEY ? status : "pending" });
  } catch (err) {
    return NextResponse.json({ error: "ai_failed", message: engineErrorMessage(err) }, { status: 502 });
  }
}
