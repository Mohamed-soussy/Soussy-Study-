"use client";

import { Camera, Check, Copy, Lightbulb, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, Field, Input, Select } from "@/components/ui/primitives";
import { CAS_OUTCOMES, cite, coreAi, useCore, type Source } from "@/lib/core/items";
import { getRepo } from "@/lib/data/repo";
import { putBlob } from "@/lib/data/idb";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const area = "w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

/** An AI helper box: input → answer, with a save button (TOK / EE / CAS helpers). */
function Helper({ task, label, placeholder, onSave }: { task: Parameters<typeof coreAi>[0]; label: string; placeholder: string; onSave?: (input: string, text: string) => void }) {
  const t = useTranslations("core");
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} htmlFor={`h-${task}`}>
        <textarea id={`h-${task}`} value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder={placeholder} className={area} dir="auto" />
      </Field>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={busy || input.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          setSaved(false);
          try {
            setOut(await coreAi(task, input));
          } catch (err) {
            setOut(`⚠️ ${err instanceof Error ? err.message : t("failed")}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Lightbulb aria-hidden />}
        {t("ask")}
      </Button>
      {out && (
        <div className="rounded-[10px] bg-surface-2 p-3">
          <Markdown content={out} citations={[]} />
          {onSave && (
            <Button size="sm" variant="ghost" className="mt-2" disabled={saved} onClick={() => { onSave(input, out); setSaved(true); }}>
              {saved ? <Check aria-hidden /> : <Plus aria-hidden />}
              {saved ? t("saved") : t("save")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SavedList<T extends { input: string; text: string }>({ items, onRemove }: { items: { id: string; data: T }[]; onRemove: (id: string) => void }) {
  const t = useTranslations("core");
  if (!items.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">{t("savedCount", { n: items.length })}</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className="rounded-[10px] border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium" dir="auto">{i.data.input}</p>
              <button type="button" onClick={() => onRemove(i.id)} aria-label={t("delete")} className="text-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
            <Markdown content={i.data.text} citations={[]} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------------- TOK ---------------- */

export function TokPanel() {
  const t = useTranslations("core.tok");
  const kq = useCore<{ input: string; text: string }>("tok_kq");
  const essays = useCore<{ input: string; text: string }>("tok_essay");
  const ex = useCore<{ prompt: string; objects: { title: string; context: string; link: string }[] }>("tok_exhibition");
  const current = ex.items[0];
  const [prompt, setPrompt] = useState("");
  const [objects, setObjects] = useState([0, 1, 2].map(() => ({ title: "", context: "", link: "" })));
  const data = current?.data ?? { prompt, objects };
  const setData = (d: typeof data) => {
    if (current) ex.update(current.id, d);
    else {
      setPrompt(d.prompt);
      setObjects(d.objects);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("kqTitle")}</h3>
        <Helper task="kq" label={t("kqLabel")} placeholder={t("kqPlaceholder")} onSave={(input, text) => kq.add({ input, text })} />
        <SavedList items={kq.items} onRemove={kq.remove} />
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("essayTitle")}</h3>
        <p className="text-sm text-muted">{t("essayText")}</p>
        <Helper task="essay" label={t("essayLabel")} placeholder={t("essayPlaceholder")} onSave={(input, text) => essays.add({ input, text })} />
        <SavedList items={essays.items} onRemove={essays.remove} />
      </Card>
      <Card className="flex flex-col gap-3 p-4 lg:col-span-2">
        <h3 className="font-semibold">{t("exTitle")}</h3>
        <p className="text-sm text-muted">{t("exText")}</p>
        <Field label={t("exPrompt")} htmlFor="ex-prompt">
          <Input id="ex-prompt" value={data.prompt} onChange={(e) => setData({ ...data, prompt: e.target.value })} placeholder={t("exPromptPlaceholder")} dir="auto" />
        </Field>
        <div className="grid gap-3 md:grid-cols-3">
          {data.objects.map((o, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
              <p className="text-sm font-semibold">{t("object", { n: i + 1 })}</p>
              <Input value={o.title} onChange={(e) => setData({ ...data, objects: data.objects.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} placeholder={t("objTitle")} aria-label={t("objTitle")} dir="auto" />
              <textarea value={o.context} onChange={(e) => setData({ ...data, objects: data.objects.map((x, j) => (j === i ? { ...x, context: e.target.value } : x)) })} rows={2} placeholder={t("objContext")} aria-label={t("objContext")} className={area} dir="auto" />
              <textarea value={o.link} onChange={(e) => setData({ ...data, objects: data.objects.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)) })} rows={3} placeholder={t("objLink")} aria-label={t("objLink")} className={area} dir="auto" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!current && (
            <Button size="sm" onClick={() => ex.add({ prompt, objects })} disabled={!prompt.trim()}>
              <Check aria-hidden />
              {t("savePlan")}
            </Button>
          )}
        </div>
        <ExhibitionCheck plan={data} />
      </Card>
    </div>
  );
}

function ExhibitionCheck({ plan }: { plan: { prompt: string; objects: { title: string; context: string; link: string }[] } }) {
  const t = useTranslations("core.tok");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = plan.prompt.trim() && plan.objects.every((o) => o.title.trim());
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          try {
            setOut(await coreAi("exhibition", `Prompt: ${plan.prompt}\n${plan.objects.map((o, i) => `Object ${i + 1}: ${o.title}. Context: ${o.context}. Link: ${o.link}`).join("\n")}`));
          } catch (err) {
            setOut(`⚠️ ${err instanceof Error ? err.message : ""}`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Lightbulb aria-hidden />}
        {t("checkLinks")}
      </Button>
      {out && (
        <div className="rounded-[10px] bg-surface-2 p-3">
          <Markdown content={out} citations={[]} />
        </div>
      )}
    </div>
  );
}

/* ---------------- Extended Essay ---------------- */

const EE_MILESTONES = ["rq", "outline", "half", "draft", "final"] as const;

export function EePanel() {
  const t = useTranslations("core.ee");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const ee = useCore<{ rq: string; words: { day: string; n: number }[]; milestones: Record<string, string>; reflections: Record<string, string> }>("ee");
  const sources = useCore<Source>("ee_source");
  const cur = ee.items[0];
  const d = cur?.data ?? { rq: "", words: [], milestones: {}, reflections: {} };
  const save = (patch: Partial<typeof d>) => (cur ? ee.update(cur.id, { ...d, ...patch }) : ee.add({ ...d, ...patch }));
  const [count, setCount] = useState("");
  const [style, setStyle] = useState<"mla" | "apa">("mla");
  const [src, setSrc] = useState<Source>({ author: "", title: "", container: "", year: "", url: "", accessed: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState("");
  const words = d.words.at(-1)?.n ?? 0;
  const refWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
  const totalRef = Object.values(d.reflections).reduce((a, s) => a + refWords(s), 0);

  const toCalendar = async () => {
    const list = EE_MILESTONES.filter((m) => d.milestones[m]);
    await getRepo().events.createMany(
      list.map((m) => ({
        title: `EE: ${t(`m.${m}`)}`,
        type: "submission" as const,
        subject_code: "core-ee",
        starts_at: new Date(`${d.milestones[m]}T08:00:00`).toISOString(),
        ends_at: null,
        all_day: true,
        description: d.rq || null,
        location: null,
        dress_code: null,
        estimated_minutes: null,
        source: "manual" as const,
        confidence: null,
        status: "todo" as const,
        in_review: false,
        reminders: [4320, 1440, 0],
        parent_id: null,
        repeat_every_days: null,
        repeat_until: null,
        linked_file_ids: [],
      })),
    );
    setMsg(t("added", { n: list.length }));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("rqTitle")}</h3>
        <p className="text-sm text-muted">{t("about", { subject: profile.eeSubject ?? "—", supervisor: profile.eeSupervisor ?? "—" })}</p>
        <Field label={t("rq")} htmlFor="ee-rq">
          <textarea id="ee-rq" defaultValue={d.rq} onBlur={(e) => e.target.value !== d.rq && save({ rq: e.target.value })} rows={2} className={area} dir="auto" />
        </Field>
        <Helper task="rq" label={t("refineLabel")} placeholder={t("refinePlaceholder")} />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("wordsTitle")}</h3>
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold tabular-nums">{words.toLocaleString(locale)}</span>
          <span className="text-muted">/ 4,000</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={words} aria-valuemax={4000} aria-label={t("wordsTitle")}>
          <div className={cn("h-full rounded-full", words > 4000 ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(100, (words / 4000) * 100)}%` }} />
        </div>
        {words > 4000 && <p className="text-sm text-danger">{t("over")}</p>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(count); if (n >= 0) { save({ words: [...d.words, { day: new Date().toISOString().slice(0, 10), n }] }); setCount(""); } }}>
          <Input type="number" min={0} value={count} onChange={(e) => setCount(e.target.value)} placeholder={t("logWords")} aria-label={t("logWords")} className="h-9 w-40" />
          <Button size="sm" type="submit" variant="outline" className="h-9">{t("log")}</Button>
        </form>
        <h4 className="mt-2 text-sm font-semibold">{t("milestones")}</h4>
        <ul className="flex flex-col gap-1.5">
          {EE_MILESTONES.map((m) => (
            <li key={m} className="flex items-center justify-between gap-2 text-sm">
              <span>{t(`m.${m}`)}</span>
              <Input type="date" value={d.milestones[m] ?? ""} onChange={(e) => save({ milestones: { ...d.milestones, [m]: e.target.value } })} className="h-8 w-40" aria-label={t(`m.${m}`)} />
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" className="self-start" onClick={toCalendar} disabled={!Object.values(d.milestones).some(Boolean)}>
          {t("toCalendar")}
        </Button>
        {msg && <p className="text-sm text-success" role="status">{msg}</p>}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("rppfTitle")}</h3>
        <p className="text-sm text-muted">{t("rppfText")}</p>
        {(["initial", "interim", "final"] as const).map((k) => (
          <Field key={k} label={t(`r.${k}`)} htmlFor={`rppf-${k}`} hint={t("words", { n: refWords(d.reflections[k] ?? "") })}>
            <textarea id={`rppf-${k}`} defaultValue={d.reflections[k] ?? ""} onBlur={(e) => save({ reflections: { ...d.reflections, [k]: e.target.value } })} rows={4} className={area} dir="auto" />
          </Field>
        ))}
        <p className={cn("text-sm", totalRef > 500 ? "text-danger" : "text-muted")}>{t("rppfTotal", { n: totalRef })}</p>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">{t("sourcesTitle")}</h3>
          <Select value={style} onChange={(e) => setStyle(e.target.value as "mla" | "apa")} className="h-8 w-auto" aria-label={t("style")}>
            <option value="mla">MLA 9</option>
            <option value="apa">APA 7</option>
          </Select>
        </div>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!src.title.trim()) return;
            sources.add(src);
            setSrc({ author: "", title: "", container: "", year: "", url: "", accessed: new Date().toISOString().slice(0, 10) });
          }}
        >
          {(["author", "title", "container", "year", "url", "accessed"] as const).map((k) => (
            <Input key={k} type={k === "accessed" ? "date" : "text"} value={src[k]} onChange={(e) => setSrc({ ...src, [k]: e.target.value })} placeholder={t(`src.${k}`)} aria-label={t(`src.${k}`)} className="h-9" dir="auto" />
          ))}
          <Button size="sm" type="submit" variant="outline" className="h-9 sm:col-span-2 sm:justify-self-start">
            <Plus aria-hidden />
            {t("addSource")}
          </Button>
        </form>
        {sources.items.length > 0 && (
          <>
            <ol className="flex flex-col gap-1.5 text-sm">
              {[...sources.items].sort((a, b) => (a.data.author || a.data.title).localeCompare(b.data.author || b.data.title)).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 ps-6 -indent-6" dir="ltr">
                  <span>{cite(s.data, style)}</span>
                  <button type="button" onClick={() => sources.remove(s.id)} aria-label={t("remove")} className="indent-0 text-muted hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
            <Button size="sm" variant="ghost" className="self-start" onClick={() => navigator.clipboard.writeText([...sources.items].map((s) => cite(s.data, style)).sort().join("\n"))}>
              <Copy aria-hidden />
              {t("copy")}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

/* ---------------- CAS ---------------- */

interface Experience {
  title: string;
  date: string;
  strands: ("C" | "A" | "S")[];
  hours: number;
  description: string;
  reflection: string;
  outcomes: string[];
  photo: string | null;
}

export function CasPanel() {
  const t = useTranslations("core.cas");
  const locale = useLocale();
  const exps = useCore<Experience>("cas_experience");
  const project = useCore<{ title: string; stages: Record<string, boolean>; notes: string }>("cas_project");
  const proj = project.items[0];
  const blank: Experience = { title: "", date: new Date().toISOString().slice(0, 10), strands: [], hours: 1, description: "", reflection: "", outcomes: [], photo: null };
  const [form, setForm] = useState<Experience>(blank);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const covered = new Set(exps.items.flatMap((e) => e.data.outcomes));
  const strandHours = (s: "C" | "A" | "S") => exps.items.filter((e) => e.data.strands.includes(s)).reduce((a, e) => a + (e.data.hours || 0), 0);

  const savePhoto = async (f: File): Promise<string> => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      const key = `core:cas:${crypto.randomUUID()}`;
      await putBlob(key, f);
      return key;
    }
    const uid = (await sb.auth.getUser()).data.user?.id;
    const path = `${uid}/cas/${crypto.randomUUID()}.${(f.type.split("/")[1] ?? "jpg").slice(0, 4)}`;
    const { error } = await sb.storage.from("core").upload(path, f, { contentType: f.type });
    if (error) throw error;
    return path;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["C", "A", "S"] as const).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-sm text-muted">{t(`strand.${s}`)}</p>
            <p className="text-2xl font-bold tabular-nums">{t("hours", { n: strandHours(s) })}</p>
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-2 p-4">
        <h3 className="font-semibold">{t("outcomesTitle")}</h3>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {CAS_OUTCOMES.map((o) => (
            <li key={o} className="flex items-center gap-2 text-sm">
              {covered.has(o) ? <Check className="size-4 text-success" aria-label={t("covered")} /> : <span className="size-4 rounded-full border border-border" aria-label={t("notCovered")} />}
              {t(`lo.${o}`)}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto font-semibold">{t("experiences", { n: exps.items.length })}</h3>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden />
          {t("export")}
        </Button>
        <Button onClick={() => setAdding((a) => !a)}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      {adding && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("title")} htmlFor="cas-title">
              <Input id="cas-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" />
            </Field>
            <Field label={t("date")} htmlFor="cas-date">
              <Input id="cas-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label={t("hoursLabel")} htmlFor="cas-hours">
              <Input id="cas-hours" type="number" min={0} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("strands")}>
            {(["C", "A", "S"] as const).map((s) => {
              const on = form.strands.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => setForm({ ...form, strands: on ? form.strands.filter((x) => x !== s) : [...form.strands, s] })} className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                  {t(`strand.${s}`)}
                </button>
              );
            })}
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder={t("description")} aria-label={t("description")} className={area} dir="auto" />
          <Helper task="reflection" label={t("promptsLabel")} placeholder={form.title || t("promptsPlaceholder")} />
          <textarea value={form.reflection} onChange={(e) => setForm({ ...form, reflection: e.target.value })} rows={4} placeholder={t("reflection")} aria-label={t("reflection")} className={area} dir="auto" />
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">{t("outcomesTitle")}</legend>
            {CAS_OUTCOMES.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.outcomes.includes(o)} onChange={(e) => setForm({ ...form, outcomes: e.target.checked ? [...form.outcomes, o] : form.outcomes.filter((x) => x !== o) })} className="size-4 accent-[var(--primary)]" />
                {t(`lo.${o}`)}
              </label>
            ))}
          </fieldset>
          <label className="inline-flex cursor-pointer items-center gap-2 self-start rounded-[10px] border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
            <Camera className="size-4" aria-hidden />
            {photo ? photo.name : t("photo")}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <Button
            className="self-start"
            disabled={!form.title.trim() || !form.strands.length}
            onClick={async () => {
              const p = photo ? await savePhoto(photo).catch(() => null) : null;
              await exps.add({ ...form, photo: p });
              setForm(blank);
              setPhoto(null);
              setAdding(false);
            }}
          >
            <Check aria-hidden />
            {t("saveExperience")}
          </Button>
        </Card>
      )}

      <ul className="flex flex-col gap-3">
        {[...exps.items].sort((a, b) => b.data.date.localeCompare(a.data.date)).map((e) => (
          <li key={e.id}>
            <Card className="flex flex-col gap-2 p-4 print:break-inside-avoid">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold" dir="auto">{e.data.title}</span>
                {e.data.strands.map((s) => <Chip key={s}>{t(`strand.${s}`)}</Chip>)}
                <span className="text-sm text-muted">{new Date(`${e.data.date}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })} · {t("hours", { n: e.data.hours })}</span>
                <button type="button" onClick={() => exps.remove(e.id)} aria-label={t("delete")} className="ms-auto text-muted hover:text-danger print:hidden">
                  <Trash2 className="size-4" />
                </button>
              </div>
              {e.data.description && <p className="text-sm" dir="auto">{e.data.description}</p>}
              {e.data.reflection && <p className="border-s-2 border-primary/40 ps-3 text-sm italic" dir="auto">{e.data.reflection}</p>}
              {e.data.outcomes.length > 0 && <p className="text-xs text-muted">{e.data.outcomes.map((o) => t(`lo.${o}`)).join(" · ")}</p>}
            </Card>
          </li>
        ))}
      </ul>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("projectTitle")}</h3>
        <Input
          defaultValue={proj?.data.title ?? ""}
          placeholder={t("projectName")}
          aria-label={t("projectName")}
          dir="auto"
          onBlur={(e) => (proj ? project.update(proj.id, { ...proj.data, title: e.target.value }) : e.target.value && project.add({ title: e.target.value, stages: {}, notes: "" }))}
        />
        <ol className="flex flex-col gap-1.5">
          {["investigation", "preparation", "action", "reflection", "demonstration"].map((s, i) => (
            <li key={s}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!proj} checked={Boolean(proj?.data.stages[s])} onChange={(e) => proj && project.update(proj.id, { ...proj.data, stages: { ...proj.data.stages, [s]: e.target.checked } })} className="size-4 accent-[var(--primary)]" />
                {i + 1}. {t(`stages.${s}`)}
              </label>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
