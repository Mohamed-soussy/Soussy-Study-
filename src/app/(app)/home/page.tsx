"use client";

import { CalendarRange, Flame, ListChecks, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import Link from "next/link";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getPack } from "@/curriculum";
import { addDays, occurrences, sameDay, startOfDay } from "@/lib/calendar/logic";
import { eventColor, intlLocale, TYPE_STYLE } from "@/lib/calendar/style";
import { useEvents } from "@/lib/calendar/use-events";
import { daysUntil } from "@/lib/profile/types";
import { cn, subjectColor } from "@/lib/utils";

/** Time-of-day greeting key. */
function greetingKey(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Mastery ring per subject (section 4). Shows 0% until quizzes and flashcards exist. */
function Ring({ value, color }: { value: number; color: string }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="4" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - value)}
      />
    </svg>
  );
}

/**
 * Home dashboard (section 4): greeting + today line, today's plan (tick items off),
 * the next 7 days as colored cards, and subjects with progress.
 */
export default function HomePage() {
  const t = useTranslations("home");
  const levelsT = useTranslations("curriculum.levels");
  const profile = useCurrentProfile();
  const pack = getPack(profile.packId);

  const firstName = profile.fullName?.trim().split(/\s+/)[0] ?? "";
  const greeting = t(greetingKey(new Date().getHours()), { name: firstName });
  const locale = useLocale();
  const { events, update } = useEvents();
  const today = startOfDay(new Date());
  const week = useMemo(() => occurrences(events, today, addDays(today, 7)), [events]); // eslint-disable-line react-hooks/exhaustive-deps
  const plan = week.filter((o) => sameDay(o.start, today) && o.event.type !== "class");
  const upcoming = week.filter((o) => !sameDay(o.start, today) && o.event.type !== "class" && o.event.status !== "done");
  const dueThisWeek = week.filter((o) => ["test", "homework", "submission"].includes(o.event.type) && o.event.status !== "done").length;
  const nextTest = events
    .filter((e) => e.type === "test" && !e.in_review && new Date(e.starts_at) >= today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const days = profile.nextExamDate ? daysUntil(profile.nextExamDate) : null;
  const todayLine = events.length
    ? `${t("dueWeek", { count: dueThisWeek })}${nextTest ? " " + t("nextTest", { title: nextTest.title, days: daysUntil(nextTest.starts_at.slice(0, 10)) }) : ""}`
    : days !== null && days >= 0
      ? t("todayExam", { days })
      : t("todayEmpty");
  const fmtDay = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  const goalMinutes = (profile.hoursPerWeek ?? 8) * 60;

  const legend = [
    { label: t("legendTest"), color: "var(--danger)" },
    { label: t("legendHomework"), color: "var(--primary)" },
    { label: t("legendSubmission"), color: "var(--submission)" },
    { label: t("legendEvent"), color: "var(--event)" },
  ];

  return (
    <>
      <PageHeader
        title={greeting}
        text={todayLine}
        action={
          <Button asChild variant="outline">
            <Link href="/onboarding?step=4">
              <Pencil aria-hidden />
              {t("editSubjects")}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="plan-title" className="flex flex-col gap-3">
            <h2 id="plan-title" className="text-lg font-semibold">
              {t("planTitle")}
            </h2>
            {plan.length === 0 ? (
              <EmptyState icon={<ListChecks className="size-7" />} title={t("planEmpty")} />
            ) : (
              <Card className="divide-y divide-border">
                {plan.map((o) => {
                  const done = o.event.status === "done";
                  return (
                    <label key={o.key} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-surface-2/60">
                      <input
                        type="checkbox"
                        className="size-5 accent-[var(--success)]"
                        checked={done}
                        onChange={() => update(o.event.id, { status: done ? "todo" : "done" })}
                      />
                      <span className="size-2 shrink-0 rounded-full" style={{ background: eventColor(o.event.type, o.event.subject_code, profile.enrollments) }} aria-hidden />
                      <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", done && "text-muted line-through")}>{o.event.title}</span>
                      {o.event.estimated_minutes && <span className="text-xs tabular-nums text-muted">{o.event.estimated_minutes}′</span>}
                    </label>
                  );
                })}
                {plan.every((o) => o.event.status === "done") && <p className="p-3 text-sm font-medium text-success">{t("allDone")}</p>}
              </Card>
            )}
          </section>

          <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="upcoming-title" className="text-lg font-semibold">
                {t("upcomingTitle")}
              </h2>
              <ul className="flex flex-wrap gap-3 text-xs text-muted">
                {legend.map((l) => (
                  <li key={l.label} className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden />
                    {l.label}
                  </li>
                ))}
              </ul>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState icon={<CalendarRange className="size-7" />} title={t("upcomingEmpty")} />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {upcoming.slice(0, 8).map((o) => {
                  const color = eventColor(o.event.type, o.event.subject_code, profile.enrollments);
                  const Icon = TYPE_STYLE[o.event.type].icon;
                  return (
                    <li key={o.key}>
                      <Link
                        href="/calendar"
                        className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 transition-shadow hover:shadow-md"
                        style={{ boxShadow: `inset 4px 0 0 ${color}` }}
                      >
                        <Icon className="size-4 shrink-0" style={{ color }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{o.event.title}</span>
                          <span className="block text-xs text-muted">{fmtDay.format(o.start)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="subjects-title" className="flex flex-col gap-3">
            <h2 id="subjects-title" className="text-lg font-semibold">
              {t("subjectsTitle")}
            </h2>
            <Card className="divide-y divide-border">
              {profile.enrollments.map((e) => (
                <div key={e.subjectId} className="flex items-center gap-3 p-3">
                  <Ring value={0} color={subjectColor(e.color)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{e.name}</p>
                    <p className="text-xs text-muted">
                      {e.level !== "None" && levelsT(e.level)}
                      {e.targetGrade && <> · {e.targetGrade}</>}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-muted">0%</span>
                </div>
              ))}
              {pack?.core && (
                <div className="flex flex-wrap items-center gap-2 p-3 text-xs text-muted">
                  <span className="font-medium text-text">{t("core")}:</span>
                  {pack.core.join(" · ")}
                </div>
              )}
            </Card>
          </section>

          <section aria-labelledby="progress-title" className="flex flex-col gap-3">
            <h2 id="progress-title" className="text-lg font-semibold">
              {t("progressTitle")}
            </h2>
            <Card className="flex flex-col gap-4 p-4">
              <p className="flex items-center gap-2 font-semibold text-text">
                <Flame className="size-5 text-warning" aria-hidden />
                {t("streak", { days: 0 })}
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full w-0 rounded-full bg-success" />
                </div>
                <p className="text-sm tabular-nums text-muted">{t("minutes", { minutes: 0, goal: goalMinutes })}</p>
              </div>
            </Card>
          </section>
        </aside>
      </div>
    </>
  );
}
