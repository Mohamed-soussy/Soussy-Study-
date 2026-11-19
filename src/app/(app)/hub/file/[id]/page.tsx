"use client";

import "pdfjs-dist/web/pdf_viewer.css"; // official text-layer sizing, so selections line up with the page

import { ArrowLeft, ChevronLeft, ChevronRight, Highlighter, Layers, Loader2, MessageSquarePlus, Sparkles, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import type { FileNote, VaultFile } from "@/lib/data/types";
import { cn } from "@/lib/utils";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

/**
 * File viewer (section 6.1): every file opens with highlight, comment and
 * "Ask AI about this page". PDFs render page by page with a selectable text layer;
 * other files show their extracted text, images and media play inline.
 */
function FileViewer() {
  const t = useTranslations("hub.viewer");
  const hub = useTranslations("hub");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const repo = getRepo();

  const [file, setFile] = useState<VaultFile | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<{ page: number; content: string }[]>([]);
  const [notes, setNotes] = useState<FileNote[]>([]);
  const [page, setPage] = useState(() => Math.max(1, Number(search.get("page")) || 1));
  const [total, setTotal] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [selection, setSelection] = useState("");
  const [comment, setComment] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isPdf = file?.mime === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    repo.files.get(id).then(async (f) => {
      setFile(f);
      if (!f) return;
      repo.files.url(f).then(setUrl).catch(() => setUrl(null));
      const p = await repo.chunks.pages(f.id);
      setPages(p);
      setTotal((cur) => cur || f.page_count || p.length);
      setNotes(await repo.notes.list(f.id));
    });
  }, [id, repo]);

  // Load the PDF once.
  useEffect(() => {
    if (!isPdf || !url) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const doc = await pdfjs.getDocument({ url }).promise;
      if (!cancelled) {
        setPdf(doc);
        setTotal(doc.numPages);
      }
    })().catch(() => setPdf(null));
    return () => {
      cancelled = true;
    };
  }, [isPdf, url]);

  // Render the current page (canvas + selectable text).
  useEffect(() => {
    if (!pdf || !canvasRef.current || !textRef.current) return;
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const p = await pdf.getPage(Math.min(page, pdf.numPages));
      const fit = wrapRef.current ? Math.min(zoom, (wrapRef.current.clientWidth - 2) / p.getViewport({ scale: 1 }).width) : zoom;
      const viewport = p.getViewport({ scale: fit });
      const ratio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const render = p.render({ canvasContext: ctx, canvas, viewport });
      task = render;
      await render.promise;
      if (cancelled) return;
      const layer = textRef.current!;
      layer.innerHTML = "";
      // pdf.js sizes the invisible text with these variables (normally set by its full viewer).
      layer.style.setProperty("--scale-factor", String(viewport.scale));
      layer.style.setProperty("--user-unit", "1");
      layer.style.setProperty("--total-scale-factor", String(viewport.scale));
      layer.style.setProperty("--scale-round-x", "1px");
      layer.style.setProperty("--scale-round-y", "1px");
      const tl = new pdfjs.TextLayer({ textContentSource: await p.getTextContent(), container: layer, viewport });
      await tl.render();
      markHighlights();
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Marks saved highlights on the text layer of this page. */
  const markHighlights = useCallback(() => {
    const layer = textRef.current;
    if (!layer) return;
    const quotes = notes.filter((n) => n.page === page && n.quote).map((n) => n.quote!.replace(/\s+/g, " ").trim().toLowerCase());
    layer.querySelectorAll("span").forEach((s) => {
      const txt = (s.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      s.classList.toggle("soussy-hl", txt.length > 1 && quotes.some((q) => q.includes(txt)));
    });
  }, [notes, page]);
  useEffect(markHighlights, [markHighlights]);

  // Track selected text for Highlight / Comment.
  useEffect(() => {
    const onSel = () => {
      const s = window.getSelection();
      const inside = s && s.anchorNode && wrapRef.current?.contains(s.anchorNode);
      setSelection(inside ? s!.toString().trim().slice(0, 1000) : "");
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  async function addNote(note: string | null) {
    if (!file || (!selection && !note)) return;
    const n = await repo.notes.create({ file_id: file.id, page, quote: selection || null, note, color: "yellow" });
    setNotes((l) => [...l, n].sort((a, b) => a.page - b.page));
    setComment(null);
    window.getSelection()?.removeAllRanges();
  }

  if (file === undefined) return <p className="py-16 text-center text-muted">{t("loading")}</p>;
  if (file === null) return <EmptyState title="404" />;

  const pageCount = total || 1;
  const currentText = pages.find((p) => p.page === page)?.content;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/hub?tab=files" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("back")}
        </Link>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold">{file.name}</h1>
          {file.summary && <p className="mt-1 max-w-prose text-muted">{file.summary}</p>}
          {file.key_terms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label={hub("keyTerms")}>
              {file.key_terms.map((k) => (
                <Chip key={k}>{k}</Chip>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push(`/flashcards?file=${file.id}`)}>
            <Layers aria-hidden />
            {hub("makeFlashcards")}
          </Button>
          <Button onClick={() => router.push(`/hub?tab=chat&file=${file.id}&page=${page}`)}>
            <Sparkles aria-hidden />
            {t("askAi")}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-w-0 flex-col gap-3">
          {(isPdf || pages.length > 1) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label={t("prevPage")}>
                <ChevronLeft className="rtl:rotate-180" />
              </Button>
              <span className="text-sm tabular-nums">{t("page", { page, total: pageCount })}</span>
              <Button variant="ghost" size="icon" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} aria-label={t("nextPage")}>
                <ChevronRight className="rtl:rotate-180" />
              </Button>
              {isPdf && (
                <span className="ms-auto flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label={t("zoomOut")}>
                    <ZoomOut />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(3, z + 0.2))} aria-label={t("zoomIn")}>
                    <ZoomIn />
                  </Button>
                </span>
              )}
            </div>
          )}

          {selection && (
            <div className="sticky top-20 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-md">
              <Button size="sm" variant="secondary" onClick={() => addNote(null)}>
                <Highlighter aria-hidden />
                {t("highlight")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setComment("")}>
                <MessageSquarePlus aria-hidden />
                {t("comment")}
              </Button>
              <span className="min-w-0 flex-1 truncate text-xs italic text-muted">“{selection}”</span>
            </div>
          )}
          {comment !== null && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addNote(comment.trim() || null);
              }}
            >
              <input
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("commentPlaceholder")}
                aria-label={t("commentPlaceholder")}
                className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3"
              />
              <Button type="submit">{t("save")}</Button>
            </form>
          )}

          <div ref={wrapRef} className="min-w-0 overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface-2 p-2">
            {isPdf ? (
              <div className="relative mx-auto w-fit bg-white shadow-sm" dir="ltr">
                {!pdf && (
                  <div className="flex h-96 w-full items-center justify-center text-muted">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                )}
                <canvas ref={canvasRef} className="block" />
                <div ref={textRef} className="textLayer soussy-text-layer" />
              </div>
            ) : file.mime.startsWith("image/") && url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={file.name} className="mx-auto max-h-[75vh] rounded-[8px]" />
            ) : file.mime.startsWith("audio/") && url ? (
              <audio controls src={url} className="w-full" />
            ) : file.mime.startsWith("video/") && url ? (
              <video controls src={url} className="max-h-[70vh] w-full rounded-[8px]" />
            ) : null}
            {!isPdf && (
              <article className="prose-sm mx-auto mt-2 max-w-prose whitespace-pre-wrap rounded-[8px] bg-surface p-5 text-[15px] leading-7" dir="auto">
                {currentText ?? <span className="text-muted">{file.error ? hub(`notes.${file.error}` as "notes.empty") : t("noText")}</span>}
              </article>
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("notes")}</h2>
          {notes.length === 0 ? (
            <p className="text-sm text-muted">{t("noNotes")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notes.map((n) => (
                <li key={n.id}>
                  <Card className={cn("flex flex-col gap-1 p-3", n.page === page && "border-warning")}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setPage(n.page)} className="text-xs font-semibold text-primary hover:underline">
                        {t("page", { page: n.page, total: pageCount })}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await repo.notes.remove(n.id);
                          setNotes((l) => l.filter((x) => x.id !== n.id));
                        }}
                        className="text-muted hover:text-danger"
                        aria-label={hub("delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {n.quote && <p className="border-s-2 border-warning ps-2 text-sm italic">“{n.quote}”</p>}
                    {n.note && <p className="text-sm">{n.note}</p>}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}

export default function FileViewerPage() {
  return (
    <Suspense>
      <FileViewer />
    </Suspense>
  );
}
