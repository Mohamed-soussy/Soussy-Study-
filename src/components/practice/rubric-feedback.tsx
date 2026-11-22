"use client";

import { ClipboardCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Select } from "@/components/ui/primitives";
import { RUBRICS, type Feedback } from "@/prompts/coach.v1";

/**
 * Rubric feedback (section 12.1): paste a draft, get feedback per criterion, an estimated band
 * and 3 concrete fixes. Always an estimate, never a grade, and it never rewrites the work.
 */
export function RubricFeedback({ defaultRubric = "ib_sci_ia" }: { defaultRubric?: string }) {
  const t = useTranslations("practice.feedback");
  const [rubric, setRubric] = useState(defaultRubric);
  const [custom, setCustom] = useState("");
  const [task, setTask] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fb, setFb] = useState<Feedback | null>(null);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  // Optional AI-writing check (Sapling). A hint for the student, never proof.
  const [ai, setAi] = useState<{ score: number; flagged: string[] } | { message: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const checkAi = async () => {
    setAiBusy(true);
    setAi(null);
    const res = await fetch("/api/ai-detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft }) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    setAi(res?.ok ? j : { message: j.message ?? t("aiCheckFailed") });
    setAiBusy(false);
  };

  const go = async () => {
    setBusy(true);
    setError("");
    setFb(null);
    try {
      const res = await fetch("/api/coach/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rubric: rubric === "custom" ? "" : rubric, custom, task, draft }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t("failed"));
      setFb(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">{t("intro")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("rubric")} htmlFor="fb-rubric">
            <Select id="fb-rubric" value={rubric} onChange={(e) => setRubric(e.target.value)}>
              {Object.entries(RUBRICS).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.label}
                </option>
              ))}
              <option value="custom">{t("custom")}</option>
            </Select>
          </Field>
          <Field label={t("task")} htmlFor="fb-task" optional={t("optional")}>
            <Input id="fb-task" value={task} onChange={(e) => setTask(e.target.value)} dir="auto" />
          </Field>
        </div>
        {rubric === "custom" && (
          <Field label={t("criteria")} htmlFor="fb-custom" hint={t("criteriaHint")}>
            <Input id="fb-custom" value={custom} onChange={(e) => setCustom(e.target.value)} dir="auto" />
          </Field>
        )}
        <Field label={t("draft")} htmlFor="fb-draft" hint={t("words", { n: words })}>
          <textarea
            id="fb-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            dir="auto"
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={go} disabled={busy || words < 80}>
            {busy ? <Loader2 className="animate-spin" /> : <ClipboardCheck aria-hidden />}
            {t("go")}
          </Button>
          <Button variant="outline" onClick={checkAi} disabled={aiBusy || words < 40}>
            {aiBusy ? <Loader2 className="animate-spin" /> : null}
            {t("aiCheck")}
          </Button>
        </div>
        {ai && "message" in ai && <p className="text-sm text-danger" role="alert">{ai.message}</p>}
        {ai && "score" in ai && (
          <div className="rounded-[10px] bg-surface-2 p-3 text-sm" role="status">
            <p className="font-semibold">{t("aiScore", { pct: Math.round(ai.score * 100) })}</p>
            {ai.flagged.length > 0 && (
              <ul className="mt-2 list-disc ps-5 text-muted">
                {ai.flagged.map((x, i) => <li key={i} dir="auto">{x}</li>)}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">{t("aiNote")}</p>
          </div>
        )}
      </Card>
      {fb && (
        <Card className="flex flex-col gap-4 p-4">
          <p className="self-start rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-text">{fb.band}</p>
          <ul className="flex flex-col gap-3">
            {fb.criteria.map((c) => (
              <li key={c.name} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums text-muted">{t("est", { got: c.estimate, max: c.max })}</span>
                </div>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(c.estimate / Math.max(1, c.max)) * 100}%` }} />
                </span>
                <p className="text-sm text-muted" dir="auto">{c.comment}</p>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">{t("strengths")}</h3>
              <ul className="mt-1 list-disc ps-5 text-sm">{fb.strengths.map((s) => <li key={s} dir="auto">{s}</li>)}</ul>
            </div>
            <div>
              <h3 className="font-semibold">{t("fixes")}</h3>
              <ol className="mt-1 list-decimal ps-5 text-sm">{fb.fixes.map((s) => <li key={s} dir="auto">{s}</li>)}</ol>
            </div>
          </div>
          <p className="text-xs text-muted">{t("estimateNote")}</p>
        </Card>
      )}
    </div>
  );
}
