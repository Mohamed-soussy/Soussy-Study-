import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { admin } from "@/lib/school/microsoft";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/account/delete — "Delete my account" (section 14): removes the student's files,
 * images, lessons, tokens and every row (the database cascades from the account). Immediate.
 */
export async function POST() {
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!supabase || !user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not_configured", message: "Account deletion needs the server's service key. Ask the app owner." }, { status: 503 });
  const db = admin();
  // Stored files first (they aren't covered by the database cascade).
  const { data: files } = await db.from("files").select("storage_path").eq("user_id", user.id);
  const vaultPaths = (files ?? []).map((f) => f.storage_path as string);
  for (let i = 0; i < vaultPaths.length; i += 100) await db.storage.from("vault").remove(vaultPaths.slice(i, i + 100));
  for (const bucket of ["community", "core"]) {
    const prefixes = [user.id, `${user.id}/notes`, `${user.id}/proofs`, `${user.id}/cas`];
    for (const prefix of prefixes) {
      const { data } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
      const paths = (data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
      if (paths.length) await db.storage.from(bucket).remove(paths);
    }
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "failed", message: error.message }, { status: 500 });
  await supabase.auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
