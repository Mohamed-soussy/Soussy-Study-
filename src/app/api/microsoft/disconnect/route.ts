import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { deleteTokens, msConfig } from "@/lib/school/microsoft";

export const runtime = "nodejs";

/**
 * POST /api/microsoft/disconnect — deletes the stored sign-in tokens and the connection.
 * Whether to keep what was imported is the student's choice; the browser handles that part.
 */
export async function POST() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (msConfig().configured) await deleteTokens(user.id).catch(() => {});
  await supabase.from("connections").delete().eq("provider", "microsoft");
  return NextResponse.json({ ok: true });
}
