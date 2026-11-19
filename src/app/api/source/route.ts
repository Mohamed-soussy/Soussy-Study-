import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Blocks local and private addresses so this can't be used to reach internal services. */
function isPublicHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.includes(":")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Very small HTML → text: drops scripts/styles/nav, keeps headings and paragraphs. */
function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const body = html
    .replace(/<(script|style|noscript|nav|footer|header|svg|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text: body };
}

/**
 * POST /api/source { url } — reads a web page the student gives as a source (section 6A.1).
 * Returns { title, text } (first 30k characters).
 */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServer();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  }
  const { url } = (await req.json()) as { url: string };
  const u = isPublicHttpUrl(url);
  if (!u) return NextResponse.json({ error: "bad_url" }, { status: 400 });
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": "SoussyStudy/1.0 (study source reader)", Accept: "text/html,text/plain" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json({ error: "fetch_failed", status: res.status }, { status: 502 });
    const type = res.headers.get("content-type") ?? "";
    const raw = (await res.text()).slice(0, 2_000_000);
    const { title, text } = type.includes("html") ? htmlToText(raw) : { title: u.hostname, text: raw };
    return NextResponse.json({ title: title || u.hostname, text: text.slice(0, 30000) });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
