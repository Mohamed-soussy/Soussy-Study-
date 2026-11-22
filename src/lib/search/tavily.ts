import "server-only";

export interface WebSnippet {
  title: string;
  url: string;
  content: string;
}

/** Web search with Tavily (public academic queries only, never student data). Empty list if not set up. */
export async function webSearch(query: string, opts: { max?: number; depth?: "basic" | "advanced" } = {}): Promise<WebSnippet[]> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: query.slice(0, 380), search_depth: opts.depth ?? "basic", max_results: opts.max ?? 5, include_answer: false }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: WebSnippet[] };
    return (data.results ?? []).map((r) => ({ title: String(r.title ?? "").slice(0, 160), url: String(r.url ?? ""), content: String(r.content ?? "").slice(0, 900) }));
  } catch {
    return [];
  }
}
