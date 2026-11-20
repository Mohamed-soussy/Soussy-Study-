"use client";

import { CalendarPlus, Lightbulb, Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Select } from "@/components/ui/primitives";
import { daysUntil } from "@/lib/profile/types";
import { coreAi, GRADE_POINTS, gpa, useCore } from "@/lib/core/items";
import { getRepo } from "@/lib/data/repo";
import type { EventType } from "@/lib/data/types";
import { cn } from "@/lib/utils";

async function toCalendar(title: string, date: string, type: EventType) {
  await getRepo().events.create({
    title,
    type,
    subject_code: null,
    starts_at: new Date(`${date}T08:00:00`).toISOString(),
    ends_at: null,
    all_day: true,
    description: null,
    location: null,
    dress_code: null,
    estimated_minutes: null,
    source: "manual",
    confidence: null,
    status: "todo",
    in_review: false,
    reminders: [10080, 4320, 1440],
    parent_id: null,
    repeat_every_days: null,
    repeat_until: null,
    linked_file_ids: [],
  });
}

/* ---------------- GPA ---------------- */

type Course = { name: string; grade: string; credits: number; level: "regular" | "honors" | "ap" };

export function GpaPanel() {
  const t = useTranslations("core.gpa");
  const courses = useCore<Course>("gpa_course");
  // "What if": try grades without saving them.
  const [whatIf, setWhatIf] = useState<Record<string, string>>({});
  const real = gpa(courses.items.map((c) => c.data));
  const tried = gpa(courses.items.map((c) => ({ ...c.data, grade: whatIf[c.id] ?? c.data.grade })));
  const [form, setForm] = useState<Course>({ name: "", grade: "A", credits: 1, level: "regular" });
  const changed = Object.keys(whatIf).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">{t("unweighted")}</p>
          <p className="text-3xl font-bold tabular-nums">{real.unweighted.toFixed(2)}</p>
          {changed && <p className="text-sm text-primary">{t("whatIfValue", { v: tried.unweighted.toFixed(2) })}</p>}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">{t("weighted")}</p>
          <p className="text-3xl font-bold tabular-nums">{real.weighted.toFixed(2)}</p>
          {changed && <p className="text-sm text-primary">{t("whatIfValue", { v: tried.weighted.toFixed(2) })}</p>}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">{t("credits")}</p>
          <p className="text-3xl font-bold tabular-nums">{real.credits}</p>
        </Card>
      </div>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">{t("text")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-start font-medium">{t("course")}</th>
                <th className="py-1 text-start font-medium">{t("level")}</th>
                <th className="py-1 text-start font-medium">{t("credits")}</th>
                <th className="py-1 text-start font-medium">{t("grade")}</th>
                <th className="py-1 text-start font-medium">{t("whatIf")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.items.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-1.5" dir="auto">{c.data.name}</td>
                  <td className="py-1.5">{t(`levels.${c.data.level}`)}</td>
                  <td className="py-1.5 tabular-nums">{c.data.credits}</td>
                  <td className="py-1.5 font-medium">{c.data.grade}</td>
                  <td className="py-1.5">
                    <Select value={whatIf[c.id] ?? c.data.grade} onChange={(e) => setWhatIf((w) => ({ ...w, [c.id]: e.target.value }))} className={cn("h-8 w-20", whatIf[c.id] && whatIf[c.id] !== c.data.grade && "border-primary")} aria-label={t("whatIfFor", { course: c.data.name })}>
                      {Object.keys(GRADE_POINTS).map((g) => <option key={g}>{g}</option>)}
                    </Select>
                  </td>
                  <td className="py-1.5 text-end">
                    <button type="button" onClick={() => courses.remove(c.id)} aria-label={t("remove")} className="text-muted hover:text-danger">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {changed && (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setWhatIf({})}>
            {t("reset")}
          </Button>
        )}
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) { courses.add(form); setForm({ ...form, name: "" }); } }}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("course")} aria-label={t("course")} className="h-9 w-48" dir="auto" />
          <Select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Course["level"] })} className="h-9 w-auto" aria-label={t("level")}>
            {(["regular", "honors", "ap"] as const).map((l) => <option key={l} value={l}>{t(`levels.${l}`)}</option>)}
          </Select>
          <Input type="number" min={0.5} step={0.5} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} aria-label={t("credits")} className="h-9 w-20" />
          <Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="h-9 w-20" aria-label={t("grade")}>
            {Object.keys(GRADE_POINTS).map((g) => <option key={g}>{g}</option>)}
          </Select>
          <Button size="sm" type="submit" className="h-9"><Plus aria-hidden />{t("add")}</Button>
        </form>
        <p className="text-xs text-muted">{t("scale")}</p>
      </Card>
    </div>
  );
}

/* ---------------- AP exams, SAT/ACT, colleges ---------------- */

export function ApPanel() {
  const t = useTranslations("core.ap");
  const locale = useLocale();
  const exams = useCore<{ name: string; date: string }>("ap_exam");
  const plan = useCore<{ input: string; text: string }>("test_plan");
  const colleges = useCore<{ name: string; type: string; date: string; status: string }>("college");
  const [exam, setExam] = useState({ name: "", date: "" });
  const [college, setCollege] = useState({ name: "", type: "RD", date: "", status: "planning" });
  const [test, setTest] = useState({ which: "SAT", date: "", current: "", target: "", hours: "5" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("examsTitle")}</h3>
        <p className="text-sm text-muted">{t("examsText")}</p>
        <ul className="flex flex-col gap-1.5">
          {[...exams.items].sort((a, b) => a.data.date.localeCompare(b.data.date)).map((e) => {
            const days = daysUntil(e.data.date);
            return (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{e.data.name}</span>
                <span className="text-muted">{fmt(e.data.date)}</span>
                <span className={cn("w-20 text-end font-semibold tabular-nums", days >= 0 && days <= 14 && "text-warning")}>{days >= 0 ? t("daysLeft", { n: days }) : t("done")}</span>
                <button type="button" onClick={() => exams.remove(e.id)} aria-label={t("remove")} className="text-muted hover:text-danger"><Trash2 className="size-4" /></button>
              </li>
            );
          })}
        </ul>
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (exam.name && exam.date) { await exams.add(exam); await toCalendar(`${exam.name} exam`, exam.date, "test"); setExam({ name: "", date: "" }); setMsg(t("addedCal")); } }}>
          <Input value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} placeholder={t("examName")} aria-label={t("examName")} className="h-9 w-48" />
          <Input type="date" value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} aria-label={t("date")} className="h-9 w-auto" />
          <Button size="sm" type="submit" className="h-9"><CalendarPlus aria-hidden />{t("addExam")}</Button>
        </form>
        <a href="https://apstudents.collegeboard.org/exam-calendar" target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">{t("officialDates")}</a>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">{t("testTitle")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Field label={t("test")} htmlFor="tp-which">
            <Select id="tp-which" value={test.which} onChange={(e) => setTest({ ...test, which: e.target.value })}><option>SAT</option><option>ACT</option></Select>
          </Field>
          <Field label={t("date")} htmlFor="tp-date"><Input id="tp-date" type="date" value={test.date} onChange={(e) => setTest({ ...test, date: e.target.value })} /></Field>
          <Field label={t("hours")} htmlFor="tp-hours"><Input id="tp-hours" type="number" min={1} value={test.hours} onChange={(e) => setTest({ ...test, hours: e.target.value })} /></Field>
          <Field label={t("current")} htmlFor="tp-cur"><Input id="tp-cur" value={test.current} onChange={(e) => setTest({ ...test, current: e.target.value })} /></Field>
          <Field label={t("target")} htmlFor="tp-tgt"><Input id="tp-tgt" value={test.target} onChange={(e) => setTest({ ...test, target: e.target.value })} /></Field>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={busy || !test.date}
          onClick={async () => {
            setBusy(true);
            try {
              const input = `${test.which} on ${test.date} (today is ${new Date().toISOString().slice(0, 10)}). Current score: ${test.current || "unknown"}. Target: ${test.target || "unknown"}. Hours available per week: ${test.hours}.`;
              const text = await coreAi("testplan", input);
              await plan.add({ input, text });
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Lightbulb aria-hidden />}
          {t("makePlan")}
        </Button>
        {plan.items.at(-1) && (
          <div className="rounded-[10px] bg-surface-2 p-3">
            <Markdown content={plan.items.at(-1)!.data.text} citations={[]} />
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4 lg:col-span-2">
        <h3 className="font-semibold">{t("collegesTitle")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-start font-medium">{t("college")}</th>
                <th className="py-1 text-start font-medium">{t("round")}</th>
                <th className="py-1 text-start font-medium">{t("deadline")}</th>
                <th className="py-1 text-start font-medium">{t("status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...colleges.items].sort((a, b) => a.data.date.localeCompare(b.data.date)).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-1.5 font-medium" dir="auto">{c.data.name}</td>
                  <td className="py-1.5">{c.data.type}</td>
                  <td className="py-1.5">{c.data.date ? `${fmt(c.data.date)} · ${t("daysLeft", { n: Math.max(0, daysUntil(c.data.date)) })}` : "—"}</td>
                  <td className="py-1.5">
                    <Select value={c.data.status} onChange={(e) => colleges.update(c.id, { ...c.data, status: e.target.value })} className="h-8 w-auto" aria-label={t("status")}>
                      {["planning", "in_progress", "submitted", "decision"].map((s) => <option key={s} value={s}>{t(`statuses.${s}`)}</option>)}
                    </Select>
                  </td>
                  <td className="py-1.5 text-end">
                    <button type="button" onClick={() => colleges.remove(c.id)} aria-label={t("remove")} className="text-muted hover:text-danger"><Trash2 className="size-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (college.name && college.date) { await colleges.add(college); await toCalendar(`${college.name} (${college.type})`, college.date, "submission"); setCollege({ ...college, name: "", date: "" }); setMsg(t("addedCal")); } }}>
          <Input value={college.name} onChange={(e) => setCollege({ ...college, name: e.target.value })} placeholder={t("college")} aria-label={t("college")} className="h-9 w-56" dir="auto" />
          <Select value={college.type} onChange={(e) => setCollege({ ...college, type: e.target.value })} className="h-9 w-auto" aria-label={t("round")}>
            {["ED", "ED2", "EA", "REA", "RD", "Rolling", "Scholarship"].map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Input type="date" value={college.date} onChange={(e) => setCollege({ ...college, date: e.target.value })} aria-label={t("deadline")} className="h-9 w-auto" />
          <Button size="sm" type="submit" className="h-9"><CalendarPlus aria-hidden />{t("addCollege")}</Button>
        </form>
        {msg && <p className="text-sm text-success" role="status">{msg}</p>}
      </Card>
    </div>
  );
}
