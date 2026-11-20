"use client";

import { Award, Flame, Loader2, Lock, Medal, Snowflake, Sparkles, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MasteryChart, StudyChart } from "@/components/progress/charts";
import { Leaderboards } from "@/components/progress/leaderboard";
import { WeeklyReport } from "@/components/progress/weekly";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/primitives";
import { detectSubject } from "@/lib/calendar/quick-add";
import { useEvents } from "@/lib/calendar/use-events";
import { loadProgress, masteryByUnit, saveAttempt, type Progress, type UnitMastery } from "@/lib/progress/stats";
import { STUDY_CHANGED } from "@/lib/progress/study";
import { XP_CHANGED } from "@/lib/progress/xp";
import { cn } from "@/lib/utils";

/** Progress (sections 12.1, 12.4, 12B): level, streak, study time, weak topics, badges, boards. */
export default function ProgressPage() {
  const t = useTranslations("progress");
  const profile = useCurrentProfile();
  const router = useRouter();
  const { events } = useEvents();
  const [p, setP] = useState<Progress | null>(null);
  const [mastery, setMastery] = useState<UnitMastery[]>([]);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    loadProgress().then(setP).catch(() => {});
    masteryByUnit().then(setMastery).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(XP_CHANGED, load);
    window.addEventListener(STUDY_CHANGED, load);
    return () => {
      window.removeEventListener(XP_CHANGED, load);
      window.removeEventListener(STUDY_CHANGED, load);
    };
  }, [load]);

  const importReport = async (file: File) => {
    setImporting(true);
    setNote("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/progress/report", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? t("report.failed"));
      for (const r of json.rows as { subject: string; topic: string; score: number; total: number }[]) {
        const code = detectSubject(`${r.subject} ${r.topic}`, profile.enrollments)?.code ?? null;
        await saveAttempt({ kind: "quiz", subject_code: code, unit: r.topic, score: r.score, total: r.total, data: { source: "report", file: file.name } });
      }
      setNote(t("report.done", { count: json.rows.length }));
      load();
    } catch (err) {
      setNote(err instanceof Error ? err.message : t("report.failed"));
    } finally {
      setImporting(false);
    }
  };

  const late = new Date().getHours() >= 23 || new Date().getHours() < 5;

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />

      {p === null ? (
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Sparkles className="size-4 text-primary" aria-hidden /> {t("level")}
            </span>
            <span className="text-3xl font-bold tabular-nums">{p.level.level}</span>
            <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={p.level.span} aria-valuenow={p.level.into} aria-label={t("toNext")}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(p.level.into / p.level.span) * 100}%` }} />
            </div>
            <span className="text-xs text-muted">{t("xp", { xp: p.xp, next: p.level.span - p.level.into })}</span>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Flame className="size-4 text-warning" aria-hidden /> {t("streak")}
            </span>
            <span className="text-3xl font-bold tabular-nums">{t("days", { n: p.streak.streak })}</span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Snowflake className="size-3.5" aria-hidden /> {p.streak.freezeUsed ? t("freezeUsed") : t("freezeReady")}
            </span>
            {late && <span className="text-xs text-muted">{t("lateNote")}</span>}
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Medal className="size-4 text-primary" aria-hidden /> {t("best")}
            </span>
            <span className="text-3xl font-bold tabular-nums">{t("days", { n: p.streak.best })}</span>
            <span className="text-xs text-muted">{t("totalTime", { h: (p.totalMinutes / 60).toFixed(1) })}</span>
          </Card>
          <Card className="flex flex-col gap-2 p-4">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Award className="size-4 text-success" aria-hidden /> {t("badgesEarned")}
            </span>
            <span className="text-3xl font-bold tabular-nums">
              {p.badges.filter((b) => b.earned).length}
              <span className="text-base font-normal text-muted"> / {p.badges.length}</span>
            </span>
            <Link href="/progress/certificate" className="text-xs font-medium text-primary hover:underline">
              {t("certificate")}
            </Link>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-4">{p && <StudyChart days={p.days} />}</Card>
        <WeeklyReport events={events} />
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">{t("mastery.title")}</h2>
            <p className="text-sm text-muted">{t("mastery.text")}</p>
          </div>
          <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2", importing && "opacity-60")}>
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" aria-hidden />}
            {t("report.button")}
            <input type="file" accept="application/pdf,image/*" className="sr-only" disabled={importing} onChange={(e) => e.target.files?.[0] && importReport(e.target.files[0])} />
          </label>
        </div>
        {note && <p className="text-sm text-muted" role="status">{note}</p>}
        <MasteryChart
          rows={mastery}
          subjects={profile.enrollments.map((e) => ({ code: e.subjectId, name: e.name }))}
          onPractice={(r) => router.push(`/exam?subject=${encodeURIComponent(r.subject)}&unit=${encodeURIComponent(r.unit)}`)}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{t("badges.title")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(p?.badges ?? []).map((b) => (
            <li key={b.id} className={cn("flex flex-col items-center gap-1.5 rounded-[12px] border p-3 text-center", b.earned ? "border-warning/50 bg-warning/5" : "border-border opacity-80")}>
              {b.earned ? <Award className="size-7 text-warning" aria-hidden /> : <Lock className="size-7 text-muted" aria-hidden />}
              <span className="text-sm font-medium">{t(`badges.${b.id}`)}</span>
              {!b.earned && (
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-label={`${Math.round(b.progress * 100)}%`}>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${b.progress * 100}%` }} />
                </span>
              )}
              <span className="sr-only">{b.earned ? t("badges.earned") : t("badges.locked")}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Leaderboards />
      <p className="text-xs text-muted">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settings#invite">{t("invite")}</Link>
        </Button>
      </p>
    </>
  );
}
