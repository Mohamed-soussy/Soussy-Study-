"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { StudyDay } from "@/lib/progress/study";
import type { UnitMastery } from "@/lib/progress/stats";
import { cn } from "@/lib/utils";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Study time for the last 14 days: one series, so one hue (the app's indigo), thin bars with
 * rounded tops, a recessive grid, a tooltip on hover/focus, and a table view.
 */
export function StudyChart({ days }: { days: StudyDay[] }) {
  const t = useTranslations("progress.chart");
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = ymd(d);
    return { key, date: d, minutes: days.find((x) => x.day === key)?.minutes ?? 0 };
  });
  const max = Math.max(60, ...series.map((s) => s.minutes));
  const top = Math.ceil(max / 60) * 60; // gridlines on whole hours
  const fmtDay = (d: Date) => d.toLocaleDateString(locale, { weekday: "short", day: "numeric" });
  const fmtMin = (m: number) => (m >= 60 ? t("hm", { h: Math.floor(m / 60), m: m % 60 }) : t("m", { m }));
  const total = series.reduce((s, x) => s + x.minutes, 0);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{t("title")}</span>
        <span className="text-sm text-muted">
          {t("total", { time: fmtMin(total) })} ·{" "}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setTable((v) => !v)}>
            {table ? t("showChart") : t("showTable")}
          </button>
        </span>
      </figcaption>
      {table ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-muted">
              <th className="py-1 text-start font-medium">{t("day")}</th>
              <th className="py-1 text-end font-medium">{t("minutes")}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.key} className="border-t border-border">
                <td className="py-1">{fmtDay(s.date)}</td>
                <td className="py-1 text-end tabular-nums">{s.minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" dir="ltr">
          {/* gridlines: recessive, labelled in hours */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40">
            {[1, 0.5].map((f) => (
              <div key={f} className="absolute inset-x-8 border-t border-dashed border-border" style={{ top: `${(1 - f) * 100}%` }}>
                <span className="absolute -start-8 -top-2 w-7 text-end text-[10px] text-muted">{Math.round((top * f) / 60)}h</span>
              </div>
            ))}
          </div>
          <div className="ms-8 flex h-40 items-end gap-[2px] border-b border-border" role="list" aria-label={t("title")}>
            {series.map((s, i) => (
              <div
                key={s.key}
                role="listitem"
                tabIndex={0}
                aria-label={`${fmtDay(s.date)}: ${fmtMin(s.minutes)}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 items-end justify-center outline-none"
              >
                <div
                  className={cn("w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity", hover !== null && hover !== i && "opacity-50")}
                  style={{ height: `${s.minutes ? Math.max(2, (s.minutes / top) * 100) : 0}%` }}
                />
                {hover === i && (
                  <div className="absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-[8px] border border-border bg-surface px-2 py-1 text-xs shadow-md">
                    <span className="block text-muted">{fmtDay(s.date)}</span>
                    <span className="font-semibold tabular-nums">{fmtMin(s.minutes)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="ms-8 flex gap-[2px] pt-1">
            {series.map((s, i) => (
              <span key={s.key} className="flex-1 text-center text-[10px] text-muted">
                {i % 2 === 1 || i === 13 ? s.date.getDate() : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

/**
 * Weak-topic chart (section 12.1): one small chart per subject, units sorted weakest
 * first, mastery as a horizontal bar on a fixed 0–100% scale. One hue; the number is
 * printed beside each bar, so nothing is read from color.
 */
export function MasteryChart({ rows, subjects, onPractice }: { rows: UnitMastery[]; subjects: { code: string; name: string }[]; onPractice: (r: UnitMastery) => void }) {
  const t = useTranslations("progress.mastery");
  const groups = subjects.map((s) => ({ ...s, rows: rows.filter((r) => r.subject === s.code) })).filter((g) => g.rows.length);
  if (!groups.length) return <p className="text-sm text-muted">{t("empty")}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => (
        <figure key={g.code} className="flex flex-col gap-2">
          <figcaption className="text-sm font-semibold">{g.name}</figcaption>
          <ul className="flex flex-col gap-1.5">
            {g.rows.slice(0, 8).map((r) => (
              <li key={r.unit} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-2 text-sm">
                <span className="truncate" dir="auto" title={r.unit}>
                  {r.unit}
                </span>
                <span className="relative h-3 rounded-full bg-surface-2" title={t("based", { n: r.evidence })}>
                  <span className="absolute inset-y-0 start-0 rounded-full bg-primary" style={{ width: `${Math.max(2, r.mastery)}%` }} />
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-9 text-end tabular-nums text-muted">{r.mastery}%</span>
                  {r.mastery < 70 && (
                    <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onPractice(r)}>
                      {t("practice")}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </figure>
      ))}
    </div>
  );
}
