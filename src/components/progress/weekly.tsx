"use client";

import { AlertTriangle, CalendarRange, Moon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { addDays, occurrences, startOfDay, startOfWeek } from "@/lib/calendar/logic";
import type { CalendarEvent } from "@/lib/data/types";
import { listStudyDays, STUDY_CHANGED, type StudyDay } from "@/lib/progress/study";
import { listXp, type XpEvent } from "@/lib/progress/xp";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DEADLINES = ["test", "homework", "submission"];

/**
 * Balance check (section 12.3): 4+ deadlines within 2 days, found early, with a nudge to
 * start sooner. After 11 pm it says "sleep" instead: no streak pressure at night.
 */
export function BalanceCheck({ events }: { events: CalendarEvent[] }) {
  const t = useTranslations("progress.balance");
  const locale = useLocale();
  const now = new Date();
  if (now.getHours() >= 23 || now.getHours() < 5)
    return (
      <Card className="flex items-start gap-3 border-primary/30 p-4">
        <Moon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm">{t("late")}</p>
      </Card>
    );
  const today = startOfDay(now);
  const occ = occurrences(
    events.filter((e) => DEADLINES.includes(e.type) && e.status !== "done"),
    today,
    addDays(today, 15),
  );
  for (let i = 0; i < 14; i++) {
    const from = addDays(today, i);
    const inWindow = occ.filter((o) => o.start >= from && o.start < addDays(from, 2));
    if (inWindow.length >= 4) {
      const fmt = (d: Date) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
      return (
        <Card className="flex items-start gap-3 border-warning/50 p-4" role="status">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold">{t("heavy", { count: inWindow.length, from: fmt(from), to: fmt(addDays(from, 1)) })}</p>
            <p className="text-muted">{t("suggest", { title: inWindow.sort((a, b) => b.start.getTime() - a.start.getTime())[0].event.title })}</p>
            <Link href="/calendar" className="font-medium text-primary hover:underline">
              {t("open")}
            </Link>
          </div>
        </Card>
      );
    }
  }
  return null;
}

/**
 * Weekly report (section 12.4): time studied, tasks done, practice accuracy, and next
 * week's crunch points. Shown on Home (prominent on Sundays) and on Progress.
 */
export function WeeklyReport({ events, compact }: { events: CalendarEvent[]; compact?: boolean }) {
  const t = useTranslations("progress.weekly");
  const locale = useLocale();
  const [days, setDays] = useState<StudyDay[]>([]);
  const [xp, setXp] = useState<XpEvent[]>([]);
  useEffect(() => {
    const load = () => {
      listStudyDays().then(setDays).catch(() => {});
      listXp().then(setXp).catch(() => {});
    };
    load();
    window.addEventListener(STUDY_CHANGED, load);
    return () => window.removeEventListener(STUDY_CHANGED, load);
  }, []);

  const weekStart = startOfWeek(new Date());
  const lastStart = addDays(weekStart, -7);
  const inRange = (d: string, a: Date, b: Date) => d >= ymd(a) && d < ymd(b);
  const sum = (from: Date, to: Date, f: (d: StudyDay) => number) => days.filter((d) => inRange(d.day, from, to)).reduce((s, d) => s + f(d), 0);
  const minutes = sum(weekStart, addDays(weekStart, 7), (d) => d.minutes);
  const lastMinutes = sum(lastStart, weekStart, (d) => d.minutes);
  const q = sum(weekStart, addDays(weekStart, 7), (d) => d.questions);
  const c = sum(weekStart, addDays(weekStart, 7), (d) => d.correct);
  const tasks = xp.filter((e) => e.kind === "task" && new Date(e.created_at) >= weekStart).length;
  const next = occurrences(
    events.filter((e) => DEADLINES.includes(e.type) && e.status !== "done" && !e.in_review),
    addDays(weekStart, 7),
    addDays(weekStart, 14),
  )
    .sort((a, b) => (b.event.type === "test" ? 1 : 0) - (a.event.type === "test" ? 1 : 0) || a.start.getTime() - b.start.getTime())
    .slice(0, 3);
  const fmtH = (m: number) => t("hours", { h: (m / 60).toFixed(1) });
  const fmt = (d: Date) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric" });
  const diff = minutes - lastMinutes;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarRange className="size-5 text-primary" aria-hidden />
        {t("title")}
      </h2>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted">{t("studied")}</dt>
          <dd className="text-xl font-bold tabular-nums">{fmtH(minutes)}</dd>
          {!compact && lastMinutes > 0 && <dd className="text-xs text-muted">{diff >= 0 ? t("up", { time: fmtH(diff) }) : t("down", { time: fmtH(-diff) })}</dd>}
        </div>
        <div>
          <dt className="text-xs text-muted">{t("tasks")}</dt>
          <dd className="text-xl font-bold tabular-nums">{tasks}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("accuracy")}</dt>
          <dd className="text-xl font-bold tabular-nums">{q ? `${Math.round((c / q) * 100)}%` : "—"}</dd>
          {!compact && q > 0 && <dd className="text-xs text-muted">{t("answers", { n: q })}</dd>}
        </div>
      </dl>
      {next.length > 0 && (
        <div className="text-sm">
          <p className="font-medium">{t("crunch")}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-muted">
            {next.map((o) => (
              <li key={o.key} dir="auto">
                {fmt(o.start)} · {o.event.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
