import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { accessToken, graph, msConfig } from "@/lib/school/microsoft";

export const runtime = "nodejs";

/**
 * GET /api/microsoft/file?id=… — a short-lived download link for one OneDrive file, so the
 * browser can add it to the vault ("Save to my files"). The link expires within minutes.
 */
export async function GET(req: NextRequest) {
  if (!msConfig().configured) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = await getSupabaseServer();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^[\w!.-]{4,200}$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const t = await accessToken(user.id);
    if (!t) return NextResponse.json({ error: "not_connected" }, { status: 404 });
    const f = await graph<{ name: string; size: number; file?: { mimeType?: string }; "@microsoft.graph.downloadUrl"?: string }>(
      t.access,
      `/me/drive/items/${encodeURIComponent(id)}?$select=id,name,size,file,@microsoft.graph.downloadUrl`,
    );
    if (!f["@microsoft.graph.downloadUrl"]) return NextResponse.json({ error: "no_download" }, { status: 404 });
    return NextResponse.json({ name: f.name, size: f.size, mime: f.file?.mimeType ?? "", url: f["@microsoft.graph.downloadUrl"] });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
