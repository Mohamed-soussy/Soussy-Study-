"use client";

import { Calculator, Eraser, Eye, LineChart, MessageCircleQuestion, PenLine, Pencil, Plus, Sigma, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { Button } from "@/components/ui/button";
import { Card, Input, PageHeader } from "@/components/ui/primitives";
import { deleteNotebook, listNotebooks, newNotebook, newTab, saveNotebook, type Notebook } from "@/lib/notes/store";
import { cn } from "@/lib/utils";

const DrawPad = dynamic(() => import("@/components/notes/draw-pad").then((m) => m.DrawPad), { ssr: false });

/** Quick-insert math (KaTeX). */
const SNIPPETS: { label: string; insert: string }[] = [
  { label: "x²", insert: "$x^{2}$" },
  { label: "√", insert: "$\\sqrt{x}$" },
  { label: "a/b", insert: "$\\frac{a}{b}$" },
  { label: "∫", insert: "$\\int_{a}^{b} f(x)\\,dx$" },
  { label: "Σ", insert: "$\\sum_{i=1}^{n} i$" },
  { label: "lim", insert: "$\\lim_{x \\to 0}$" },
  { label: "π", insert: "$\\pi$" },
  { label: "θ", insert: "$\\theta$" },
  { label: "≤", insert: "$\\le$" },
  { label: "→", insert: "$\\rightarrow$" },
];

/**
 * Notes (section 4A): notebooks with tabs (like Google Docs), math formulas,
 * a calculator and Desmos beside the page, handwriting, and the Study Hub AI can
 * read them ("in my Math notes, lesson 8.1, I don't get line 4").
 */
export default function NotesPage() {
  const t = useTranslations("notes");
  const [books, setBooks] = useState<Notebook[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [mode, setMode] = useState<"write" | "preview" | "draw">("write");
  const [side, setSide] = useState<"none" | "calc" | "graph">("none");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [clearKey, setClearKey] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listNotebooks()
      .then((list) => {
        const l = list.length ? list : [newNotebook()];
        setBooks(l);
        setBookId(l[0].id);
        setTabId(l[0].tabs[0]?.id ?? null);
      })
      .catch(() => {});
  }, []);

  const book = books.find((b) => b.id === bookId) ?? null;
  const tab = book?.tabs.find((x) => x.id === tabId) ?? book?.tabs[0] ?? null;

  // Save a moment after typing stops.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((nb: Notebook) => {
    setBooks((all) => all.map((b) => (b.id === nb.id ? nb : b)));
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveNotebook(nb).then(() => setSaved(true)).catch(() => {}), 600);
  }, []);

  const setContent = (content: string) => book && tab && update({ ...book, tabs: book.tabs.map((x) => (x.id === tab.id ? { ...x, content } : x)) });

  const insert = (snippet: string) => {
    const el = area.current;
    if (!el || !tab) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = tab.content.slice(0, a) + snippet + tab.content.slice(b);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + snippet.length;
    });
  };

  const lines = useMemo(() => Math.max(1, (tab?.content ?? "").split("\n").length), [tab?.content]);

  const addBook = async () => {
    const nb = newNotebook(t("untitled"));
    setBooks((all) => [nb, ...all]);
    setBookId(nb.id);
    setTabId(nb.tabs[0].id);
    setRenaming(nb.id);
    await saveNotebook(nb);
  };
  const addTab = () => {
    if (!book) return;
    const tb = newTab(t("tabN", { n: book.tabs.length + 1 }));
    update({ ...book, tabs: [...book.tabs, tb] });
    setTabId(tb.id);
    setRenaming(tb.id);
  };
  const removeTab = (id: string) => {
    if (!book || book.tabs.length < 2 || !confirm(t("deleteTabConfirm"))) return;
    const tabs = book.tabs.filter((x) => x.id !== id);
    update({ ...book, tabs });
    setTabId(tabs[0].id);
  };
  const removeBook = async () => {
    if (!book || !confirm(t("deleteBookConfirm", { name: book.title }))) return;
    await deleteNotebook(book.id);
    const rest = books.filter((b) => b.id !== book.id);
    const l = rest.length ? rest : [newNotebook()];
    setBooks(l);
    setBookId(l[0].id);
    setTabId(l[0].tabs[0]?.id ?? null);
  };

  return (
    <>
      <PageHeader title={t("title")} text={t("textTabs")} />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Notebooks */}
        <aside className="flex min-w-0 flex-col gap-2">
          <Button size="sm" onClick={addBook}>
            <Plus aria-hidden /> {t("newBook")}
          </Button>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {books.map((b) => (
              <li key={b.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setBookId(b.id);
                    setTabId(b.tabs[0]?.id ?? null);
                  }}
                  className={cn("w-full truncate rounded-[8px] px-3 py-2 text-start text-sm", b.id === bookId ? "bg-primary-soft font-semibold text-primary" : "hover:bg-surface-2")}
                  dir="auto"
                >
                  {b.title || t("untitled")}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {book && tab && (
          <section className="flex min-w-0 flex-col gap-3">
            {/* Notebook title */}
            <div className="flex flex-wrap items-center gap-2">
              {renaming === book.id ? (
                <Input autoFocus defaultValue={book.title} onBlur={(e) => { update({ ...book, title: e.target.value.trim() || t("untitled") }); setRenaming(null); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-10 max-w-md text-lg font-semibold" dir="auto" aria-label={t("bookName")} />
              ) : (
                <h2 className="text-xl font-semibold" dir="auto">{book.title}</h2>
              )}
              <Button size="icon" variant="ghost" onClick={() => setRenaming(book.id)} aria-label={t("rename")}><Pencil /></Button>
              <Button size="icon" variant="ghost" onClick={removeBook} aria-label={t("deleteBook")}><Trash2 /></Button>
              <span className="ms-auto text-xs text-muted" role="status">{saved ? t("saved") : t("saving")}</span>
            </div>

            {/* Tabs, like Google Docs */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={t("tabs")}>
              {book.tabs.map((x) => (
                <div key={x.id} className={cn("group flex shrink-0 items-center rounded-t-[8px] border-b-2", x.id === tab.id ? "border-primary bg-surface" : "border-transparent")}>
                  {renaming === x.id ? (
                    <input autoFocus defaultValue={x.title} onBlur={(e) => { update({ ...book, tabs: book.tabs.map((y) => (y.id === x.id ? { ...y, title: e.target.value.trim() || y.title } : y)) }); setRenaming(null); }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-8 w-32 bg-transparent px-2 text-sm outline-none" dir="auto" aria-label={t("tabName")} />
                  ) : (
                    <button type="button" role="tab" aria-selected={x.id === tab.id} onClick={() => setTabId(x.id)} onDoubleClick={() => setRenaming(x.id)} className={cn("px-3 py-2 text-sm", x.id === tab.id ? "font-semibold text-primary" : "text-muted")} dir="auto">
                      {x.title}
                    </button>
                  )}
                  {x.id === tab.id && book.tabs.length > 1 && (
                    <button type="button" onClick={() => removeTab(x.id)} className="me-1 rounded p-0.5 text-muted hover:text-danger" aria-label={t("deleteTab")}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={addTab} className="shrink-0"><Plus aria-hidden /> {t("addTab")}</Button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div role="tablist" className="inline-flex rounded-[10px] bg-surface-2 p-1">
                {(["write", "preview", "draw"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-sm font-medium", mode === m ? "bg-surface text-primary shadow-sm" : "text-muted")}>
                    {m === "write" ? <PenLine className="size-4" /> : m === "preview" ? <Eye className="size-4" /> : <Pencil className="size-4" />}
                    {t(`mode.${m}`)}
                  </button>
                ))}
              </div>
              {mode === "write" && (
                <div className="flex flex-wrap items-center gap-1" aria-label={t("math")}>
                  <Sigma className="size-4 text-muted" aria-hidden />
                  {SNIPPETS.map((s) => (
                    <button key={s.label} type="button" onClick={() => insert(s.insert)} className="rounded-[6px] border border-border px-2 py-1 text-sm hover:border-primary" title={s.insert}>
                      {s.label}
                    </button>
                  ))}
                  <button type="button" onClick={() => insert("\n$$\n\n$$\n")} className="rounded-[6px] border border-border px-2 py-1 text-xs hover:border-primary">{t("mathBlock")}</button>
                </div>
              )}
              {mode === "draw" && (
                <>
                  <Button size="sm" variant={tool === "pen" ? "primary" : "outline"} onClick={() => setTool("pen")}><PenLine aria-hidden />{t("pen")}</Button>
                  <Button size="sm" variant={tool === "eraser" ? "primary" : "outline"} onClick={() => setTool("eraser")}><Eraser aria-hidden />{t("eraser")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setClearKey((k) => k + 1)}><Trash2 aria-hidden />{t("clear")}</Button>
                </>
              )}
              <div className="ms-auto flex flex-wrap gap-1">
                <Button size="sm" variant={side === "calc" ? "primary" : "outline"} onClick={() => setSide((s) => (s === "calc" ? "none" : "calc"))}><Calculator aria-hidden />{t("calculator")}</Button>
                <Button size="sm" variant={side === "graph" ? "primary" : "outline"} onClick={() => setSide((s) => (s === "graph" ? "none" : "graph"))}><LineChart aria-hidden />Desmos</Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/hub?notes=${encodeURIComponent(book.id)}&tab=${encodeURIComponent(tab.id)}`}><MessageCircleQuestion aria-hidden />{t("askAi")}</Link>
                </Button>
              </div>
            </div>

            <div className={cn("grid gap-3", side !== "none" && "xl:grid-cols-[minmax(0,1fr)_420px]")}>
              {mode === "write" ? (
                <div className="flex min-h-[60vh] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface focus-within:border-primary">
                  <div ref={gutter} className="select-none overflow-hidden border-e border-border bg-surface-2 px-2 py-4 text-end font-mono text-xs leading-7 text-muted" aria-hidden>
                    {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
                  </div>
                  <textarea
                    ref={area}
                    value={tab.content}
                    onChange={(e) => setContent(e.target.value)}
                    onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
                    placeholder={t("placeholderMath")}
                    aria-label={t("title")}
                    dir="auto"
                    wrap="off"
                    className="min-w-0 flex-1 resize-none overflow-auto bg-transparent p-4 text-base leading-7 outline-none"
                  />
                </div>
              ) : mode === "preview" ? (
                <Card className="min-h-[60vh] p-5">
                  {tab.content.trim() ? <Markdown content={tab.content} citations={[]} /> : <p className="text-muted">{t("empty")}</p>}
                </Card>
              ) : (
                <DrawPad tool={tool} clearKey={clearKey} />
              )}
              {side !== "none" && (
                <Card className="overflow-hidden p-0">
                  <iframe
                    key={side}
                    title={side === "calc" ? t("calculator") : "Desmos"}
                    src={side === "calc" ? "https://www.desmos.com/scientific" : "https://www.desmos.com/calculator"}
                    className="h-[60vh] w-full border-0"
                    allow="clipboard-write"
                  />
                </Card>
              )}
            </div>
            <p className="text-xs text-muted">{t("mathHint")}</p>
          </section>
        )}
      </div>
    </>
  );
}
