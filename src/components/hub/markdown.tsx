"use client";

import "katex/dist/katex.min.css";
import "katex/contrib/mhchem"; // \ce{...} chemical formulas
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Citation } from "@/lib/data/types";

/** Turns "[2]" into a citation link (but leaves real Markdown links alone). */
function linkCitations(md: string) {
  return md.replace(/\[(\d{1,2})\](?!\()/g, (_, n) => `[\\[${n}\\]](#cite-${n})`);
}

/** Chat answer renderer: Markdown, tables, LaTeX math, chemistry and clickable citations (section 6.2). */
export function Markdown({ content, citations }: { content: string; citations: Citation[] }) {
  return (
    <div className="soussy-md text-[15px] leading-7" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          a: ({ href, children }) => {
            const m = href?.match(/^#cite-(\d+)$/);
            if (m) {
              const c = citations.find((x) => x.n === Number(m[1]));
              if (!c) return <sup className="text-muted">[{m[1]}]</sup>;
              const target = c.url ?? (c.file_id ? `/hub/file/${c.file_id}${c.page ? `?page=${c.page}` : ""}` : "#");
              const label = `${c.file_name}${c.page ? `, p. ${c.page}` : ""}`;
              return (
                <Link
                  href={target}
                  target={c.url ? "_blank" : undefined}
                  title={label}
                  aria-label={label}
                  className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1 align-text-top text-[11px] font-semibold text-primary no-underline hover:bg-primary hover:text-on-primary"
                >
                  {m[1]}
                </Link>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(content)}
      </ReactMarkdown>
    </div>
  );
}
