import { NextResponse, type NextRequest } from "next/server";
import { engineConfigured, geminiJSON, ROUTES } from "@/lib/ai/engines";
import { guardAi } from "@/lib/ai/server";
import { isBlocked, OFFICIAL_PAPERS, sourceName, tierOf } from "@/lib/resources/trust";
import { ENRICH_SCHEMA, ENRICH_SYSTEM, type Enriched } from "@/prompts/resources.v1";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface ResourceCard {
  title: string;
  url: string;
  source: string;
  tier: 1 | 2 | 3 | 4;
  type: string;
  level: string;
  summary: string;
  why: string;
}

/** Shown when TAVILY_API_KEY isn't set (rule 0: build the screen, label demo data). */
const DEMO: ResourceCard[] = [
  { title: "Electromagnetic induction (Khan Academy)", url: "https://www.khanacademy.org/science/physics/magnetic-forces-and-magnetic-fields", source: "khanacademy.org", tier: 1, type: "video", level: "both", summary: "Faraday's law and flux\nWorked examples with coils\nLenz's law direction", why: "Short videos that match your unit, from an official source." },
  { title: "OpenStax University Physics: Faraday's law", url: "https://openstax.org/books/university-physics-volume-2/pages/13-1-faradays-law", source: "openstax.org", tier: 1, type: "explainer", level: "HL", summary: "Free open textbook chapter\nDerivations and diagrams\nEnd-of-section problems", why: "Goes deeper than the syllabus: good for HL." },
  { title: "Physics Classroom: Lenz's law", url: "https://www.physicsclassroom.com/", source: "physicsclassroom.com", tier: 2, type: "notes", level: "both", summary: "Plain-language notes\nDirection of induced current\nCheck-your-understanding questions", why: "Clear notes for the sign rule students often get wrong." },
];

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

async function tavily(query: string, key: string): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 8, include_answer: false }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return ((await res.json()) as { results?: TavilyResult[] }).results ?? [];
}

/**
 * POST /api/resources/search — finds what students who already took a unit used (section 9.1).
 * Body: { curriculum: "ib-dp", course: "IB Physics HL", unit, topic?, want?: "notes"|"questions"|"video"|"past papers" }
 * The query is public academic text (no personal data), so summaries can use Gemini.
 */
export async function POST(req: NextRequest) {
  const blocked = await guardAi();
  if (blocked) return blocked;
  const b = (await req.json()) as { curriculum?: string; course?: string; unit?: string; topic?: string; want?: string };
  const course = (b.course ?? "").slice(0, 80);
  const unit = (b.unit ?? "").slice(0, 120);
  const topic = (b.topic ?? "").slice(0, 120);
  if (!course || !(unit || topic)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const official = OFFICIAL_PAPERS[b.curriculum ?? ""] ?? [];
  const wantsPapers = /past ?paper|exam paper|markscheme|mark scheme/i.test(`${b.want} ${topic}`);

  const key = process.env.TAVILY_API_KEY;
  if (!key) return NextResponse.json({ demo: true, results: DEMO, official });

  const base = `${course} ${unit} ${topic}`.replace(/\s+/g, " ").trim();
  const queries =
    b.want && b.want !== "all"
      ? [`${base} ${wantsPapers ? "exam style questions" : b.want}`]
      : [`${base} revision notes`, `${base} practice questions with answers`, `${base} explained video`];
  let raw: TavilyResult[] = [];
  try {
    raw = (await Promise.all(queries.map((q) => tavily(q, key).catch(() => [])))).flat();
  } catch {
    return NextResponse.json({ error: "search_failed", message: "Web search isn't answering right now. Try again in a minute." }, { status: 502 });
  }
  const seen = new Set<string>();
  const results = raw
    .filter((r) => r.url && !isBlocked(r.url) && !seen.has(r.url) && seen.add(r.url))
    .map((r) => ({ ...r, tier: tierOf(r.url) }))
    .sort((a, b) => a.tier - b.tier || b.score - a.score)
    .slice(0, 12);

  let enriched: Enriched["results"] = [];
  if (results.length && engineConfigured("gemini")) {
    try {
      const out = await geminiJSON<Enriched>(ROUTES.resources, {
        system: ENRICH_SYSTEM,
        prompt: `Course: ${course}. Unit: ${unit}${topic ? `, topic: ${topic}` : ""}.\n\n${results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content.slice(0, 600)}`).join("\n\n")}`,
        schema: ENRICH_SCHEMA,
        maxOutputTokens: 3000,
        minimalThinking: true,
        timeoutMs: 30000,
      });
      enriched = out.results;
    } catch {
      /* fall back to the search excerpts */
    }
  }
  const cards: ResourceCard[] = results
    .map((r, i) => {
      const e = enriched.find((x) => x.n === i + 1);
      if (e && !e.relevant) return null;
      return {
        title: r.title.slice(0, 160),
        url: r.url,
        source: sourceName(r.url),
        tier: r.tier,
        type: e?.type ?? (r.tier === 4 ? "video" : "notes"),
        level: e?.level ?? "unknown",
        summary: (e?.summary ?? r.content).split("\n").slice(0, 3).join("\n").slice(0, 400),
        why: e?.why ?? "",
      };
    })
    .filter((c): c is ResourceCard => c !== null);
  return NextResponse.json({ demo: false, results: cards, official: wantsPapers ? official : official.slice(0, 1) });
}
