import { NextResponse, type NextRequest } from "next/server";
import { extractFile } from "@/lib/extract";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST /api/extract
 * - Signed in: JSON { storagePath, name, mime }. The server downloads the file with the
 *   student's own session, so storage rules still apply.
 * - Demo mode: multipart form with "file".
 * Returns { kind, pages: string[], note? }.
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  try {
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
      const { storagePath, name, mime } = (await req.json()) as { storagePath: string; name: string; mime: string };
      if (!storagePath?.startsWith(`${user.id}/`)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      const { data, error } = await supabase.storage.from("vault").download(storagePath);
      if (error || !data) return NextResponse.json({ error: "download_failed" }, { status: 404 });
      const buf = Buffer.from(await data.arrayBuffer());
      return NextResponse.json(await extractFile(buf, name, mime));
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await extractFile(buf, file.name, file.type));
  } catch (err) {
    console.error("extract failed", err);
    return NextResponse.json({ error: "extract_failed" }, { status: 500 });
  }
}
