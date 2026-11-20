"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import "katex/contrib/mhchem";
import { AlertTriangle, BadgeCheck, Camera, ChevronDown, FileText, HelpCircle, Keyboard, Loader2, PenTool, RotateCcw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { FunctionGraph } from "@/components/solver/graph";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getPack } from "@/curriculum";
import { getRepo } from "@/lib/data/repo";
import { getRepo3, type Mistake, type Prefs, type SavedSolution } from "@/lib/data/repo3";
import type { VaultFile } from "@/lib/data/types";
import type { SimilarProblem, SolveResponse } from "@/lib/solver/types";
import { sameAnswer } from "@/lib/solver/verify";
import { cn } from "@/lib/utils";
import { awardXp } from "@/lib/progress/xp";

/** Renders LaTeX (display or inline); falls back to plain text. */
function Tex({ math, block }: { math: string; block?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math.replace(/^\$+|\$+$/g, ""), { displayMode: block, throwOnError: false, strict: false });
    } catch {
      return null;
    }
  }, [math, block]);
  return html ? <span dir="ltr" className={cn(block && "block overflow-x-auto py-1")} dangerouslySetInnerHTML={{ __html: html }} /> : <code>{math}</code>;
}

const MATH_WORDS = /^(sin|cos|tan|log|ln|lim|exp|sqrt|frac|pi|theta|int|Delta|to|le|ge|circ)$/i;

/** For the live preview: keeps ordinary words as text and the rest as math ("Solve x^2 = 4"). */
function previewLatex(input: string): string {
  if (input.includes("$")) return input;
  const parts = input.split(/(\s+)/).map((tok) => {
    const word = tok.match(/^[A-Za-z؀-ۿ]{3,}[.,:;!?]?$/);
    if (!word || MATH_WORDS.test(tok.replace(/[.,:;!?]$/, ""))) return tok;
    return `\\text{${tok}}`;
  });
  return `$${parts.join("").replace(/(\\text\{[^}]*\})(\s+)/g, "$1\\ ")}$`;
}

/** Calculator keystrokes as plain text, even if the model slipped LaTeX spacing in. */
function plainKeys(s: string): string {
  return s
    .replace(/\\[;,!: ]/g, " ")
    .replace(/\\times/g, "×")
    .replace(/\\(?:text|mathrm)\{([^}]*)\}/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Math keyboard: inserts LaTeX at the cursor (section 8 input). */
const KEYS: [string, string][] = [
  ["x²", "^2"],
  ["xʸ", "^{}"],
  ["√", "\\sqrt{}"],
  ["a/b", "\\frac{}{}"],
  ["π", "\\pi"],
  ["θ", "\\theta"],
  ["∫", "\\int "],
  ["d/dx", "\\frac{d}{dx}"],
  ["lim", "\\lim_{x \\to }"],
  ["sin", "\\sin("],
  ["cos", "\\cos("],
  ["tan", "\\tan("],
  ["ln", "\\ln("],
  ["log", "\\log_{}"],
  ["≤", "\\le "],
  ["≥", "\\ge "],
  ["Δ", "\\Delta "],
  ["°", "^\\circ"],
];

function readFileB64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Downscale big photos: smaller upload, fewer tokens, same readability.
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL("image/jpeg", 0.85);
      resolve({ b64: data.slice(data.indexOf(",") + 1), mime: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function SolverPage() {
  const t = useTranslations("solver");
  const locale = useLocale() as "en" | "ar";
  const router = useRouter();
  const profile = useCurrentProfile();
  const pack = getPack(profile.packId);
  const repo3 = getRepo3();

  const [tab, setTab] = useState<"type" | "photo" | "file">("type");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [photo, setPhoto] = useState<{ b64: string; mime: string; url: string } | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [fileId, setFileId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(true);
  const [shown, setShown] = useState(1);
  const [openWhy, setOpenWhy] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [similar, setSimilar] = useState<SimilarProblem[] | null>(null);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { value: string; result?: "right" | "wrong" }>>({});
  const [history, setHistory] = useState<SavedSolution[]>([]);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    repo3.prefs.get().then(setPrefs).catch(() => {});
    repo3.solutions.list().then(setHistory).catch(() => {});
    repo3.mistakes.list().then(setMistakes).catch(() => {});
    getRepo().files.list().then((f) => setFiles(f.filter((x) => x.status === "ready"))).catch(() => {});
  }, [repo3]);

  // Paste a screenshot anywhere on the page.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const { b64, mime } = await readFileB64(file);
      setPhoto({ b64, mime, url: URL.createObjectURL(file) });
      setTab("photo");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function insert(snippet: string) {
    const el = inputRef.current;
    if (!el) return setText((x) => x + snippet);
    const { selectionStart: a, selectionEnd: b } = el;
    const next = text.slice(0, a) + snippet + text.slice(b);
    setText(next);
    const caret = a + (snippet.includes("{}") ? snippet.indexOf("{}") + 1 : snippet.length);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  async function solve() {
    setError(null);
    setResult(null);
    setSimilar(null);
    setAnswers({});
    let problem = text.trim();
    if (tab === "file") {
      const pages = fileId ? await getRepo().chunks.pages(fileId) : [];
      problem = `${pages.find((p) => p.page === page)?.content ?? ""}\n\n${text}`.trim();
    }
    if (tab !== "photo" && problem.length < 2) return;
    if (tab === "photo" && !photo) return;
    setLoading(true);
    const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem,
          image: tab === "photo" ? photo?.b64 : undefined,
          mime: photo?.mime,
          subject: enrollment?.name,
          level: enrollment && enrollment.level !== "None" ? enrollment.level : undefined,
          curriculum: pack?.id === "ib-dp" ? "IB Diploma" : pack?.id === "american-hs" ? "American high school (AP)" : undefined,
          language: locale,
        }),
      });
      const data = (await res.json()) as SolveResponse & { message?: string };
      if (!res.ok) throw new Error(data.message ?? String(res.status));
      setResult(data);
      setShown(hint ? 1 : data.solution.steps.length);
      const saved = await repo3.solutions.create({
        problem: data.problem,
        subject: data.solution.subject,
        topic: data.solution.topic,
        solution: data.solution,
        verification: data.verification,
      });
      setHistory((h) => [saved, ...h].slice(0, 30));
      void awardXp("solver", 5, saved.id);
    } catch (err) {
      setError(t("error", { message: err instanceof Error ? err.message : "?" }));
    } finally {
      setLoading(false);
    }
  }

  async function trySimilar() {
    if (!result) return;
    setSimilarLoading(true);
    try {
      const res = await fetch("/api/solve/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: result.problem, topic: result.solution.topic, language: locale }),
      });
      const data = (await res.json()) as { problems?: SimilarProblem[]; message?: string };
      if (data.problems) {
        setSimilar(data.problems);
        setAnswers({});
      } else setError(t("error", { message: data.message ?? "?" }));
    } finally {
      setSimilarLoading(false);
    }
  }

  async function checkSimilar(i: number) {
    const p = similar?.[i];
    const given = answers[i]?.value ?? "";
    if (!p || !given.trim()) return;
    const right = sameAnswer(given, p.answer_value);
    setAnswers((a) => ({ ...a, [i]: { value: given, result: right ? "right" : "wrong" } }));
    if (!right && result) {
      const m = { source: "solver" as const, subject: result.solution.subject, topic: result.solution.topic, question: p.question, given, correct: p.answer };
      await repo3.mistakes.create(m);
      setMistakes((l) => [{ ...m, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...l]);
    }
  }

  function sendToWhiteboard() {
    if (!result) return;
    try {
      sessionStorage.setItem("soussy.whiteboard.fromSolver", JSON.stringify({ problem: result.problem, solution: result.solution }));
    } catch {
      /* ignore */
    }
    router.push("/whiteboard?from=solver");
  }

  const gdc = prefs.gdc ?? "ti84";
  const sol = result?.solution;
  const v = result?.verification;
  const marksByStep = new Map<number, string[]>();
  sol?.mark_scheme.forEach((m) => marksByStep.set(m.step, [...(marksByStep.get(m.step) ?? []), m.mark]));
  const mistakesByTopic = mistakes.reduce<Record<string, number>>((acc, m) => ((acc[m.topic ?? "—"] = (acc[m.topic ?? "—"] ?? 0) + 1), acc), {});

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-w-0 flex-col gap-5">
          {/* Input */}
          <Card className="flex flex-col gap-3 p-4">
            <div role="tablist" className="inline-flex self-start rounded-[10px] bg-surface-2 p-1">
              {(
                [
                  ["type", t("type"), Keyboard],
                  ["photo", t("photo"), Camera],
                  ["file", t("fromFiles"), FileText],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={cn("inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium", tab === id ? "bg-surface text-primary shadow-sm" : "text-muted")}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            {tab === "photo" && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => photoInput.current?.click()}>
                    <Camera aria-hidden />
                    {t("takePhoto")}
                  </Button>
                  {photo && <Chip color="var(--success)">{t("photoReady")}</Chip>}
                </div>
                <input
                  ref={photoInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const { b64, mime } = await readFileB64(f);
                    setPhoto({ b64, mime, url: URL.createObjectURL(f) });
                  }}
                />
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="max-h-64 self-start rounded-[10px] border border-border" />
                )}
                <p className="text-xs text-muted">{t("pasteHint")}</p>
              </div>
            )}

            {tab === "file" && (
              <div className="flex flex-wrap gap-2">
                <Select aria-label={t("pickFile")} value={fileId} onChange={(e) => setFileId(e.target.value)} className="w-auto min-w-0 flex-1">
                  <option value="">{t("pickFile")}</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>
                <Input type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} aria-label={t("page")} className="w-24" />
              </div>
            )}

            <textarea
              ref={inputRef}
              id="solver-input"
              rows={3}
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              aria-label={t("placeholder")}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            {tab === "type" && (
              <div className="flex flex-wrap gap-1" aria-label="Math keyboard">
                {KEYS.map(([label, snippet]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => insert(snippet)}
                    className="min-w-10 rounded-[8px] border border-border bg-surface-2 px-2 py-1 font-mono text-sm hover:border-primary/50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {text.trim() && /[\\^_]/.test(text) && (
              <div className="rounded-[10px] bg-surface-2/70 px-3 py-2 text-sm">
                <span className="me-2 text-xs font-semibold uppercase text-muted">{t("preview")}</span>
                <Markdown content={previewLatex(text)} citations={[]} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label={t("subject")} value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 w-auto">
                <option value="">{t("anySubject")}</option>
                {profile.enrollments.map((s) => (
                  <option key={s.subjectId} value={s.subjectId}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <label className="inline-flex items-center gap-2 text-sm" title={t("hintModeText")}>
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={hint} onChange={(e) => setHint(e.target.checked)} />
                {t("hintMode")}
              </label>
              <Button className="ms-auto" onClick={solve} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
                {loading ? t("solving") : t("solve")}
              </Button>
            </div>
          </Card>

          {error && (
            <p role="alert" className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {/* Solution, always in the order of section 8 */}
          {sol && v && (
            <article className="flex flex-col gap-4" data-testid="solution">
              <div className="flex flex-wrap items-center gap-2">
                {v.status === "verified" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success" title={t("verifiedText", { detail: v.detail })} data-testid="badge">
                    <BadgeCheck className="size-4" aria-hidden />
                    {t("verified")}
                  </span>
                ) : v.status === "failed" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-sm font-semibold text-text" data-testid="badge">
                    <AlertTriangle className="size-4 text-warning" aria-hidden />
                    {t("uncertain")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-muted" data-testid="badge">
                    {t("notCheckable")}
                  </span>
                )}
                <Chip>{sol.topic}</Chip>
                <span className="text-xs text-muted">
                  {v.status === "verified" ? t("verifiedText", { detail: v.detail }) : v.status === "failed" ? t("uncertainText", { detail: v.detail }) : t("notCheckableText", { detail: "" })}
                </span>
              </div>
              {v.attempts > 1 && v.status === "verified" && <p className="text-xs text-muted">{t("attempts")}</p>}

              <Card className="flex flex-col gap-4 p-5">
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("problem")}</h3>
                  <Markdown content={result!.problem} citations={[]} />
                </section>
                {sol.known.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("known")}</h3>
                    <ul className="flex flex-wrap gap-2">
                      {sol.known.map((k, i) => (
                        <li key={i} className="rounded-[8px] bg-surface-2 px-2.5 py-1 text-sm">
                          {k.quantity}: <strong>{k.value}</strong> {k.unit}
                        </li>
                      ))}
                    </ul>
                    {sol.unknown && (
                      <p className="mt-2 text-sm">
                        {t("unknown")}: <strong>{sol.unknown}</strong>
                      </p>
                    )}
                  </section>
                )}
                <section>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("idea")}</h3>
                  <p dir="auto">{sol.idea}</p>
                </section>

                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("steps")}</h3>
                    {shown < sol.steps.length && (
                      <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setShown(sol.steps.length)}>
                        {t("showAll")}
                      </button>
                    )}
                  </div>
                  <ol className="flex flex-col gap-2">
                    {sol.steps.slice(0, shown).map((s, i) => (
                      <li key={i} className="rounded-[10px] border border-border p-3">
                        <div className="flex items-start gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <Tex math={s.math} block />
                            <p className="text-sm text-muted" dir="auto">
                              {s.text}
                            </p>
                          </div>
                          {marksByStep.get(i)?.map((m) => (
                            <span key={m} title={t(`marks.${m}` as "marks.M1")} className="rounded-full border border-submission/40 bg-submission/10 px-2 py-0.5 text-xs font-semibold text-submission">
                              {m}
                            </span>
                          ))}
                        </div>
                        <button type="button" onClick={() => setOpenWhy(openWhy === i ? null : i)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary" aria-expanded={openWhy === i}>
                          <HelpCircle className="size-3.5" aria-hidden />
                          {t("why")}
                          <ChevronDown className={cn("size-3 transition-transform", openWhy === i && "rotate-180")} aria-hidden />
                        </button>
                        {openWhy === i && (
                          <p className="mt-1 rounded-[8px] bg-primary-soft/60 p-2 text-sm" dir="auto">
                            {s.why}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                  {shown < sol.steps.length && (
                    <Button variant="secondary" className="mt-2" onClick={() => setShown((n) => n + 1)}>
                      {t("nextStep")} ({shown}/{sol.steps.length})
                    </Button>
                  )}
                </section>

                {shown >= sol.steps.length && (
                  <>
                    <section>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("answer")}</h3>
                      <div className="inline-block rounded-[10px] border-2 border-primary px-4 py-2" data-testid="answer">
                        <Tex math={sol.answer.latex} block />
                      </div>
                    </section>
                    <section>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("check")}</h3>
                      <Markdown content={sol.check} citations={[]} />
                    </section>
                  </>
                )}
              </Card>

              {sol.graph.show && sol.graph.expression && (
                <Card className="flex flex-col gap-2 p-4">
                  <h3 className="font-semibold">{t("graph")}</h3>
                  <FunctionGraph expression={sol.graph.expression} xmin={sol.graph.xmin} xmax={sol.graph.xmax} labels={{ zoomIn: t("zoomIn"), zoomOut: t("zoomOut") }} />
                </Card>
              )}

              {(sol.gdc.ti84 || sol.gdc.nspire || sol.gdc.casio) && (
                <Card className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{t("gdc")}</h3>
                    <div role="tablist" className="inline-flex rounded-[10px] bg-surface-2 p-1">
                      {(
                        [
                          ["ti84", "TI-84 Plus CE"],
                          ["nspire", "TI-Nspire CX"],
                          ["casio", "Casio fx-CG50"],
                        ] as const
                      ).map(([id, name]) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={gdc === id}
                          onClick={() => {
                            const next = { ...prefs, gdc: id };
                            setPrefs(next);
                            repo3.prefs.set(next).catch(() => {});
                          }}
                          className={cn("rounded-[8px] px-2.5 py-1 text-xs font-medium", gdc === id ? "bg-surface text-primary shadow-sm" : "text-muted")}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap font-mono text-sm" dir="ltr">
                    {plainKeys(sol.gdc[gdc] || "—")}
                  </p>
                </Card>
              )}

              {sol.mark_scheme.length > 0 && (
                <Card className="flex flex-col gap-2 p-4">
                  <h3 className="font-semibold">{t("markScheme")}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {sol.mark_scheme.map((m, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-8 shrink-0 font-semibold text-submission">{m.mark}</span>
                        <span className="text-muted">#{m.step + 1}</span>
                        <span dir="auto">{m.note}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={trySimilar} disabled={similarLoading}>
                  {similarLoading ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
                  {t("similar")}
                </Button>
                <Button variant="outline" onClick={sendToWhiteboard}>
                  <PenTool aria-hidden />
                  {t("toWhiteboard")}
                </Button>
              </div>

              {similar && (
                <Card className="flex flex-col gap-3 p-4">
                  <div>
                    <h3 className="font-semibold">{t("similar")}</h3>
                    <p className="text-sm text-muted">{t("similarText")}</p>
                  </div>
                  <ol className="flex flex-col gap-3">
                    {similar.map((p, i) => (
                      <li key={i} className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
                        <Markdown content={`${i + 1}. ${p.question}`} citations={[]} />
                        <form
                          className="flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            checkSimilar(i);
                          }}
                        >
                          <Input
                            aria-label={t("yourAnswer")}
                            placeholder={t("yourAnswer")}
                            value={answers[i]?.value ?? ""}
                            onChange={(e) => setAnswers((a) => ({ ...a, [i]: { value: e.target.value } }))}
                            className="h-10"
                            dir="ltr"
                          />
                          <Button type="submit" size="sm" className="h-10">
                            {t("checkAnswer")}
                          </Button>
                        </form>
                        {answers[i]?.result === "right" && <p className="text-sm font-medium text-success">{t("correct")}</p>}
                        {answers[i]?.result === "wrong" && <p className="text-sm text-danger">{t("wrong", { answer: p.answer })}</p>}
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </article>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("mistakes")}</h2>
            {Object.keys(mistakesByTopic).length === 0 ? (
              <p className="text-sm text-muted">{t("noMistakes")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {Object.entries(mistakesByTopic)
                  .sort((a, b) => b[1] - a[1])
                  .map(([topic, n]) => (
                    <li key={topic} className="flex items-center justify-between rounded-[8px] bg-surface-2/60 px-2 py-1.5 text-sm">
                      <span className="truncate">{topic}</span>
                      <span className="font-semibold tabular-nums text-danger">{n}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
          {history.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</h2>
              <ul className="flex flex-col gap-1">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full truncate rounded-[8px] px-2 py-2 text-start text-sm hover:bg-surface-2"
                      onClick={() => {
                        setResult({ problem: h.problem, solution: h.solution as SolveResponse["solution"], verification: h.verification as SolveResponse["verification"] });
                        setShown(hint ? 1 : (h.solution as SolveResponse["solution"]).steps.length);
                        setSimilar(null);
                      }}
                      dir="auto"
                    >
                      {h.topic ? `${h.topic}: ` : ""}
                      {h.problem}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
