"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { addDays, dayKey, monthGrid, occurrences, sameDay, startOfDay, startOfWeek, type Occurrence } from "@/lib/calendar/logic";
import { eventColor, intlLocale, TYPE_STYLE } from "@/lib/calendar/style";
import type { CalendarEvent } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

export type View = "month" | "week" | "day" | "agenda";

interface ViewProps {
  events: CalendarEvent[];
  cursor: Date;
  enrollments: Enrollment[];
  onOpen: (id: string) => void;
  /** Drag to move: new start for the dragged event. */
  onMove: (id: string, newStart: Date, allDay: boolean) => void;
  onPickDay: (d: Date) => void;
}

const DRAG_TYPE = "application/x-soussy-event";

/** A compact event pill: icon + title, colored by type (progressive disclosure: click for the rest). */
function EventChip({ occ, enrollments, onOpen, compact }: { occ: Occurrence; enrollments: Enrollment[]; onOpen: (id: string) => void; compact?: boolean }) {
  const locale = useLocale();
  const e = occ.event;
  const color = eventColor(e.type, e.subject_code, enrollments);
  const Icon = TYPE_STYLE[e.type].icon;
  const time = e.all_day ? null : occ.start.toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      type="button"
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: e.id, offset: occ.start.getTime() - new Date(e.starts_at).getTime() }));
        ev.dataTransfer.effectAllowed = "move";
      }}
      onClick={(ev) => {
        ev.stopPropagation();
        onOpen(e.id);
      }}
      title={e.title}
      className={cn(
        "group flex w-full min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 text-start text-xs font-medium transition-[filter] hover:brightness-95",
        compact ? "py-0.5" : "py-1",
        e.status === "done" && "opacity-55",
      )}
      style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))`, color: "var(--text)", boxShadow: `inset 3px 0 0 ${color}` }}
    >
      {e.status === "done" ? (
        <Check className="size-3 shrink-0" style={{ color }} aria-hidden />
      ) : (
        <Icon className="size-3 shrink-0" style={{ color }} aria-hidden />
      )}
      {time && <span className="shrink-0 tabular-nums text-muted">{time}</span>}
      <span className={cn("truncate", e.status === "done" && "line-through")}>{e.title}</span>
    </button>
  );
}

function useDrop(onMove: ViewProps["onMove"], events: CalendarEvent[]) {
  const [over, setOver] = useState<string | null>(null);
  const handlers = (key: string, target: Date, allDay: boolean) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (!ev.dataTransfer.types.includes(DRAG_TYPE)) return;
      ev.preventDefault();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (ev: React.DragEvent) => {
      const raw = ev.dataTransfer.getData(DRAG_TYPE);
      setOver(null);
      if (!raw) return;
      ev.preventDefault();
      const { id, offset } = JSON.parse(raw) as { id: string; offset: number };
      const e = events.find((x) => x.id === id);
      if (!e) return;
      const old = new Date(e.starts_at);
      const next = new Date(target);
      if (allDay) next.setHours(old.getHours(), old.getMinutes(), 0, 0);
      // For repeating events, shift the whole series by the same amount.
      onMove(id, new Date(next.getTime() - offset), allDay ? e.all_day : false);
    },
  });
  return { over, handlers };
}

export function MonthView({ events, cursor, enrollments, onOpen, onMove, onPickDay }: ViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const occ = useMemo(() => occurrences(events, days[0], addDays(days[41], 1)), [events, days]);
  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occ) {
      const k = dayKey(o.start);
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    return m;
  }, [occ]);
  const { over, handlers } = useDrop(onMove, events);
  const today = new Date();
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short" });

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
        {days.slice(0, 7).map((d) => (
          <div key={d.getDay()} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted">
            {weekday.format(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div
              key={k}
              {...handlers(k, d, true)}
              onClick={() => onPickDay(d)}
              className={cn(
                "flex min-h-[92px] min-w-0 cursor-pointer flex-col gap-1 border-border p-1 sm:min-h-[112px] sm:p-1.5",
                i % 7 !== 6 && "border-e",
                i < 35 && "border-b",
                !inMonth && "bg-surface-2/40",
                over === k && "bg-primary-soft",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center self-end rounded-full text-xs tabular-nums",
                  isToday ? "bg-primary font-semibold text-on-primary" : inMonth ? "text-text" : "text-muted",
                )}
              >
                {d.getDate()}
              </span>
              {/* Phones: colored dots. Larger screens: chips. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 4).map((o) => (
                  <span key={o.key} className="size-1.5 rounded-full" style={{ background: eventColor(o.event.type, o.event.subject_code, enrollments) }} />
                ))}
              </div>
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, 3).map((o) => (
                  <EventChip key={o.key} occ={o} enrollments={enrollments} onOpen={onOpen} compact />
                ))}
                {list.length > 3 && (
                  <span className="px-1.5 text-[11px] font-medium text-muted">{t("more", { count: list.length - 3 })}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 07:00–22:00

export function TimeGridView({ events, cursor, enrollments, onOpen, onMove, onPickDay, days: count }: ViewProps & { days: 1 | 7 }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const start = count === 7 ? startOfWeek(cursor) : startOfDay(cursor);
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  const occ = useMemo(() => occurrences(events, start, addDays(start, count)), [events, start.getTime(), count]); // eslint-disable-line react-hooks/exhaustive-deps
  const { over, handlers } = useDrop(onMove, events);
  const fmtDay = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric" });
  const fmtHour = new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric" });
  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
      <div className={cn("grid", count === 7 ? "min-w-[720px]" : "")} style={{ gridTemplateColumns: `56px repeat(${count}, minmax(0, 1fr))` }}>
        {/* header */}
        <div className="border-b border-e border-border" />
        {days.map((d) => (
          <button
            type="button"
            key={dayKey(d)}
            onClick={() => onPickDay(d)}
            className={cn("border-b border-border px-2 py-2 text-center text-sm font-medium", sameDay(d, today) ? "text-primary" : "text-text")}
          >
            {fmtDay.format(d)}
          </button>
        ))}
        {/* all-day row */}
        <div className="border-b border-e border-border px-1 py-2 text-[11px] text-muted">{t("allDay")}</div>
        {days.map((d) => {
          const k = `all-${dayKey(d)}`;
          return (
            <div key={k} {...handlers(k, d, true)} className={cn("flex min-h-10 flex-col gap-0.5 border-b border-s border-border p-1", over === k && "bg-primary-soft")}>
              {occ
                .filter((o) => o.event.all_day && sameDay(o.start, d))
                .map((o) => (
                  <EventChip key={o.key} occ={o} enrollments={enrollments} onOpen={onOpen} compact />
                ))}
            </div>
          );
        })}
        {/* hours */}
        {HOURS.map((h) => (
          <div key={h} className="contents">
            <div className="h-14 border-e border-border px-1 pt-0.5 text-end text-[11px] tabular-nums text-muted">
              {fmtHour.format(new Date(2026, 0, 1, h))}
            </div>
            {days.map((d) => {
              const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
              const k = `${dayKey(d)}-${h}`;
              return (
                <div key={k} {...handlers(k, slot, false)} className={cn("flex h-14 flex-col gap-0.5 overflow-hidden border-s border-t border-border/70 p-0.5", over === k && "bg-primary-soft")}>
                  {occ
                    .filter((o) => !o.event.all_day && sameDay(o.start, d) && o.start.getHours() === h)
                    .map((o) => (
                      <EventChip key={o.key} occ={o} enrollments={enrollments} onOpen={onOpen} compact />
                    ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgendaView({ events, cursor, enrollments, onOpen }: ViewProps) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const from = startOfDay(cursor);
  const occ = useMemo(() => occurrences(events, from, addDays(from, 60)), [events, from.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occ) m.set(dayKey(o.start), [...(m.get(dayKey(o.start)) ?? []), o]);
    return Array.from(m.entries());
  }, [occ]);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "long", day: "numeric", month: "long" });

  if (!groups.length) {
    return <p className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-muted">{t("agendaEmpty")}</p>;
  }
  return (
    <ol className="flex flex-col gap-4">
      {groups.map(([k, list]) => (
        <li key={k} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">{fmt.format(list[0].start)}</h3>
          <div className="flex flex-col gap-1.5">
            {list.map((o) => (
              <EventChip key={o.key} occ={o} enrollments={enrollments} onOpen={onOpen} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
