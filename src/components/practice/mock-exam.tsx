"use client";

import { Calculator, Clock, Loader2, Play, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Field, Select } from "@/components/ui/primitives";
import { curriculumName, getPack } from "@/curriculum";
import { unitsFor } from "@/curriculum/units";
import { getRepo3 } from "@/lib/data/repo3";
import { saveAttempt } from "@/lib/progress/stats";
import { recordStudy } from "@/lib/progress/study";
import { awardXp } from "@/lib/progress/xp";
import { clock } from "@/lib/school/dates";
import { cn } from "@/lib/utils";
import type { Exam } from "@/prompts/coach.v1";

const STYLES = {
  "ib-dp": ["IB Paper 1 (multiple choice)", "IB Paper 2 (structured questions)"],
  "american-hs": ["AP multiple choice", "AP free response", "Unit test"],
  "ib-cp": ["IB Paper 1 (multiple choice)", "IB Paper 2 (structured questions)"],
  "ib-myp": ["MYP eAssessment style", "Criterion-based unit test"],
  cambridge: ["Cambridge Paper 1 (multiple choice)", "Cambridge structured paper", "Cambridge extended paper"],
  edexcel: ["Edexcel exam paper", "Edexcel multiple choice"],
  uk: ["GCSE / A Level exam paper", "Multiple choice"],
  saudi: ["Tahsili style (multiple choice)", "Qudurat style (multiple choice)", "Final exam"],
  indian: ["CBSE board exam paper", "Multiple choice"],
  french: ["Épreuve du bac", "Contrôle"],
  custom: ["Multiple choice", "Structured questions"],
} as Record<string, string[]>;

type Result = { n: number; awarded: number; feedback: string };

/** Mock exam simulator (section 12.1): timed, original questions, marked against a markscheme. */
export function MockExam() {
  const t = useTranslations("practice.exam");
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const pack = getPack(profile.packId);
  const [subject, setSubject] = useState(params.get("subject") ?? profile.enrollments[0]?.subjectId ?? "");
  const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
  const units = useMemo(() => (enrollment ? unitsFor(profile.packId, enrollment.subjectId).map((u) => u.name) : []), [enrollment, profile.packId]);
  const [picked, setPicked] = useState<string[]>(() => (params.get("unit") ? [params.get("unit")!] : []));
  const [custom, setCustom] = useState("");
  const styles = STYLES[profile.packId ?? "custom"] ?? STYLES.custom;
  const [style, setStyle] = useState(styles[0]);
  const [minutes, setMinutes] = useState(30);
  const [calculator, setCalculator] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [marked, setMarked] = useState<Result[] | null>(null);
  const [marking, setMarking] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    if (!exam || marked) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [exam, marked]);
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  // Time's up: hand it in automatically, like a real exam.
  useEffect(() => {
    if (exam && !marked && endsAt && left === 0 && !submitted.current) void submit();
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    const list = [...picked, ...custom.split(",").map((s) => s.trim())].filter(Boolean);
    if (!enrollment || !list.length) return setError(t("pickUnits"));
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/coach/exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course: `${enrollment.name} ${enrollment.level !== "None" ? enrollment.level : ""}`.trim(), curriculum: curriculumName(pack?.id) ?? "", units: list, style, minutes, calculator }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t("failed"));
      setExam(json.exam);
      setAnswers({});
      setMarked(null);
      submitted.current = false;
      setEndsAt(Date.now() + json.minutes * 60_000);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  async function submit() {
    if (!exam || submitted.current) return;
    submitted.current = true;
    setMarking(true);
    const results: Result[] = exam.questions
      .filter((q) => q.type === "mcq")
      .map((q) => ({ n: q.n, awarded: Number(answers[q.n]) === q.answer && answers[q.n] !== undefined ? 1 : 0, feedback: q.markscheme }));
    const written = exam.questions.filter((q) => q.type !== "mcq");
    if (written.length) {
      try {
        const res = await fetch("/api/coach/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: written.map((q) => ({ n: q.n, prompt: q.prompt, marks: q.marks, markscheme: q.markscheme, answer: answers[q.n] ?? "" })) }),
        });
        const json = await res.json();
        results.push(...((json.results ?? []) as Result[]));
      } catch {
        /* show the markscheme even if marking failed */
      }
    }
    setMarked(results);
    setMarking(false);
    // Each unit's share of the marks feeds the weak-topic chart.
    const byUnit = new Map<string, { s: number; t: number }>();
    for (const q of exam.questions) {
      const r = results.find((x) => x.n === q.n);
      const cur = byUnit.get(q.unit) ?? { s: 0, t: 0 };
      byUnit.set(q.unit, { s: cur.s + (r?.awarded ?? 0), t: cur.t + q.marks });
    }
    for (const [unit, v] of byUnit) await saveAttempt({ kind: "mock", subject_code: subject, unit, score: v.s, total: v.t, data: { style } });
    const score = results.reduce((s, r) => s + r.awarded, 0);
    const total = exam.questions.reduce((s, q) => s + q.marks, 0);
    await recordStudy({ questions: exam.questions.length, correct: results.filter((r) => r.awarded > 0).length });
    await awardXp("exam", Math.min(150, 20 + Math.round((score / Math.max(1, total)) * 60)), `exam:${endsAt}`);
    // Wrong answers go to the mistake log, like the solver's.
    for (const q of exam.questions) {
      const r = results.find((x) => x.n === q.n);
      if (r && r.awarded < q.marks) await getRepo3().mistakes.create({ source: "quiz", subject, topic: q.unit, question: q.prompt.slice(0, 500), given: (answers[q.n] ?? "").slice(0, 500), correct: q.markscheme.slice(0, 500) }).catch(() => {});
    }
  }

  if (exam) {
    const total = exam.questions.reduce((s, q) => s + q.marks, 0);
    const score = marked?.reduce((s, r) => s + r.awarded, 0) ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <Card className="sticky top-16 z-10 flex flex-wrap items-center gap-3 p-3">
          <h2 className="min-w-0 flex-1 truncate font-semibold" dir="auto">
            {exam.title}
          </h2>
          {!marked ? (
            <>
              <span className={cn("flex items-center gap-1 font-mono text-lg tabular-nums", left < 300 && "text-warning")} role="timer" aria-label={t("timeLeft")}>
                <Clock className="size-5" aria-hidden /> {clock(left)}
              </span>
              <span className="flex items-center gap-1 text-sm text-muted">{calculator ? <Calculator className="size-4" /> : <Calculator className="size-4 opacity-40" />} {calculator ? t("calcOn") : t("calcOff")}</span>
              <Button onClick={() => submit()} disabled={marking}>
                {marking ? <Loader2 className="animate-spin" /> : <Send aria-hidden />}
                {t("handIn")}
              </Button>
            </>
          ) : (
            <span className="text-lg font-bold" role="status">
              {t("score", { score, total, pct: Math.round((score / Math.max(1, total)) * 100) })}
            </span>
          )}
        </Card>
        {marking && <p className="text-sm text-muted">{t("marking")}</p>}
        <p className="text-sm text-muted" dir="auto">
          {exam.instructions}
        </p>
        <ol className="flex flex-col gap-4">
          {exam.questions.map((q) => {
            const r = marked?.find((x) => x.n === q.n);
            return (
              <li key={q.n}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-line" dir="auto">
                      <span className="font-semibold">{q.n}. </span>
                      {q.prompt}
                    </p>
                    <span className="shrink-0 text-sm text-muted">[{q.marks}]</span>
                  </div>
                  {q.type === "mcq" ? (
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("question", { n: q.n })}>
                      {q.options.map((o, i) => {
                        const chosen = answers[q.n] === String(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            disabled={Boolean(marked)}
                            onClick={() => setAnswers((a) => ({ ...a, [q.n]: String(i) }))}
                            dir="auto"
                            className={cn(
                              "rounded-[10px] border px-3 py-2 text-start text-sm",
                              chosen ? "border-primary bg-primary-soft" : "border-border hover:border-primary",
                              marked && i === q.answer && "border-success bg-success/10",
                              marked && chosen && i !== q.answer && "border-danger bg-danger/10",
                            )}
                          >
                            <span className="me-2 font-semibold">{String.fromCharCode(65 + i)}</span>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      value={answers[q.n] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.n]: e.target.value }))}
                      disabled={Boolean(marked)}
                      rows={q.type === "long" ? 8 : 4}
                      dir="auto"
                      aria-label={t("answer", { n: q.n })}
                      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-80"
                    />
                  )}
                  {marked && (
                    <div className="rounded-[10px] bg-surface-2 p-3 text-sm">
                      <p className="font-semibold">{t("awarded", { got: r?.awarded ?? 0, of: q.marks })}</p>
                      {r?.feedback && q.type !== "mcq" && <p className="mt-1" dir="auto">{r.feedback}</p>}
                      <p className="mt-2 whitespace-pre-line text-muted" dir="auto">
                        <span className="font-medium text-text">{t("markscheme")} </span>
                        {q.markscheme}
                      </p>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
        {marked && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setExam(null)}>{t("another")}</Button>
            <p className="text-sm text-muted">{t("estimate")}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <p className="text-sm text-muted">{t("intro")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("subject")} htmlFor="ex-subject">
          <Select id="ex-subject" value={subject} onChange={(e) => { setSubject(e.target.value); setPicked([]); }}>
            {profile.enrollments.map((e) => (
              <option key={e.subjectId} value={e.subjectId}>
                {e.name} {e.level !== "None" ? e.level : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("style")} htmlFor="ex-style">
          <Select id="ex-style" value={style} onChange={(e) => setStyle(e.target.value)}>
            {styles.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("length")} htmlFor="ex-min">
          <Select id="ex-min" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {t("minutes", { m })}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("units")}</legend>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => {
            const on = picked.includes(u);
            return (
              <button key={u} type="button" aria-pressed={on} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== u) : [...p, u].slice(-6)))} className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                {u}
              </button>
            );
          })}
        </div>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={t("customUnits")}
          aria-label={t("customUnits")}
          dir="auto"
          className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={calculator} onChange={(e) => setCalculator(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        {t("calculator")}
      </label>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button onClick={start} disabled={busy} className="self-start" size="lg">
        {busy ? <Loader2 className="animate-spin" /> : <Play aria-hidden />}
        {busy ? t("writing") : t("start")}
      </Button>
    </Card>
  );
}
