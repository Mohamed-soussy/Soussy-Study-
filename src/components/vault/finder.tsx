"use client";

import { BookmarkPlus, Check, ExternalLink, FileQuestion, Loader2, Search, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Card, Chip, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { getPack } from "@/curriculum";
import { unitsFor } from "@/curriculum/units";
import { getRepo6 } from "@/lib/data/repo6";
import { cn } from "@/lib/utils";

interface ResourceCard {
  title: string;
  url: string;
  source: string;
  tier: 1 | 2 | 3 | 4;
  type: string;
  level: string;
  summary: string;
  why: string;
}

const TIER_COLOR = { 1: "var(--success)", 2: "var(--primary)", 3: "var(--warning)", 4: "var(--event)" } as const;

/** Resource finder (section 9.1): search the web by curriculum → subject → unit, ranked by trust. */
export function ResourceFinder() {
  const t = useTranslations("vault.find");
  const profile = useCurrentProfile();
  const pack = getPack(profile.packId);
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState("");
  const [want, setWant] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<{ demo: boolean; results: ResourceCard[]; official: { label: string; url: string }[] } | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<{ title: string; text: string | null } | null>(null);

  const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
  const units = enrollment ? unitsFor(profile.packId, enrollment.subjectId) : [];
  const course = enrollment ? `${pack?.id === "ib-dp" ? "IB " : pack?.id === "american-hs" ? "" : ""}${enrollment.name}${enrollment.level && enrollment.level !== "None" ? ` ${enrollment.level}` : ""}` : "";

  const search = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/resources/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum: profile.packId, course, unit, topic, want }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t("failed"));
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const save = async (c: ResourceCard) => {
    await getRepo6().saved.add({ url: c.url, title: c.title, source: c.source, kind: c.type, summary: c.summary, notes: null, subject_code: subject || null, unit: unit || topic || null });
    setSaved((s) => new Set(s).add(c.url));
  };

  const makeQuestions = async (c: ResourceCard) => {
    setQuestions({ title: c.title, text: null });
    const res = await fetch("/api/resources/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ course, unit: unit || topic, title: c.title, summary: c.summary }) });
    const json = await res.json().catch(() => ({}));
    setQuestions({ title: c.title, text: res.ok ? json.text : `⚠️ ${json.message ?? t("failed")}` });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted">{t("intro")}</p>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (subject && (unit || topic)) search();
          }}
        >
          <Field label={t("subject")} htmlFor="find-subject">
            <Select id="find-subject" value={subject} onChange={(e) => { setSubject(e.target.value); setUnit(""); }}>
              {profile.enrollments.map((e) => (
                <option key={e.subjectId} value={e.subjectId}>
                  {e.name} {e.level !== "None" ? e.level : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("unit")} htmlFor="find-unit">
            {units.length ? (
              <Select id="find-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">{t("pickUnit")}</option>
                {units.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input id="find-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("unitPlaceholder")} dir="auto" />
            )}
          </Field>
          <Field label={t("topic")} htmlFor="find-topic" optional={t("optional")}>
            <Input id="find-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topicPlaceholder")} dir="auto" />
          </Field>
          <Field label={t("want")} htmlFor="find-want">
            <Select id="find-want" value={want} onChange={(e) => setWant(e.target.value)}>
              {["all", "notes", "questions", "video", "past papers"].map((w) => (
                <option key={w} value={w}>
                  {t(`wants.${w.replace(" ", "_")}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={busy || !subject || !(unit || topic)}>
              {busy ? <Loader2 className="animate-spin" /> : <Search aria-hidden />}
              {t("search")}
            </Button>
          </div>
        </form>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </Card>

      {data?.demo && (
        <p className="self-start rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-text">{t("demo")}</p>
      )}

      {data && data.official.length > 0 && (
        <Card className="flex flex-col gap-2 border-success/40 p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-success" aria-hidden /> {t("officialTitle")}
          </h3>
          <p className="text-sm text-muted">{t("officialText")}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {data.official.map((o) => (
              <li key={o.url}>
                <a href={o.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  {o.label} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.results.length === 0 && <EmptyState title={t("none")} text={t("noneText")} />}

      {data && data.results.length > 0 && (
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {data.results.map((c) => (
            <li key={c.url}>
              <Card className="flex h-full flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip color={TIER_COLOR[c.tier]}>{t(`tier.${c.tier}`)}</Chip>
                  <Chip>{t(`types.${c.type}`)}</Chip>
                  {c.level !== "unknown" && <Chip>{c.level === "both" ? "HL · SL" : c.level === "general" ? t("general") : c.level}</Chip>}
                </div>
                <a href={c.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" dir="auto">
                  {c.title}
                </a>
                <p className="text-xs text-muted">{c.source}</p>
                <p className="whitespace-pre-line text-sm" dir="auto">
                  {c.summary}
                </p>
                {c.why && (
                  <p className="text-sm text-muted" dir="auto">
                    <span className="font-medium text-text">{t("why")} </span>
                    {c.why}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden />
                      {t("open")}
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => save(c)} disabled={saved.has(c.url)}>
                    {saved.has(c.url) ? <Check aria-hidden /> : <BookmarkPlus aria-hidden />}
                    {saved.has(c.url) ? t("saved") : t("save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => makeQuestions(c)}>
                    <FileQuestion aria-hidden />
                    {t("questions")}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={questions !== null} onClose={() => setQuestions(null)} title={t("questionsTitle")} closeLabel={t("close")} wide>
        {questions && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t("questionsNote", { title: questions.title })}</p>
            {questions.text ? <Markdown content={questions.text} citations={[]} /> : <Loader2 className={cn("size-5 animate-spin text-muted")} />}
          </div>
        )}
      </Drawer>
    </div>
  );
}
