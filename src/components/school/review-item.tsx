"use client";

import { AlertTriangle, Check, ExternalLink, Pencil, PlayCircle, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Input } from "@/components/ui/primitives";
import { intlLocale, TYPE_STYLE } from "@/lib/calendar/style";
import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent, Origin } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { resolveConflict } from "@/lib/school/apply";
import { clock } from "@/lib/school/dates";
import { cn, subjectColor } from "@/lib/utils";

const dayKeyOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Where an item came from: "Heard at 34:12" (jumps to that moment), "Teams", "Calendar feed". */
export function OriginChip({ o, onSeek }: { o: Origin; onSeek?: (s: number) => void }) {
  const t = useTranslations("school.origin");
  const label = o.kind === "lesson" && o.at !== undefined ? t("heardAt", { time: clock(o.at) }) : t(o.kind);
  const cls = "inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary hover:text-on-primary";
  if (o.kind === "lesson" && onSeek && o.at !== undefined)
    return (
      <button type="button" className={cls} onClick={() => onSeek(o.at!)} title={o.quote}>
        <PlayCircle className="size-3.5" aria-hidden />
        {label}
      </button>
    );
  if (o.href)
    return (
      <Link href={o.href} className={cls} title={o.quote ?? o.label} target={o.href.startsWith("http") ? "_blank" : undefined}>
        {o.kind === "lesson" ? <PlayCircle className="size-3.5" aria-hidden /> : <ExternalLink className="size-3.5" aria-hidden />}
        {label}
      </Link>
    );
  return <span className={cls}>{label}</span>;
}

/**
 * One item found at school (a lesson, Teams, a feed, pasted text) waiting for one tap:
 * Accept, Edit or Dismiss (sections 10.4 and 11.2). Also settles date conflicts.
 */
export function ReviewItem({
  event,
  all,
  enrollments,
  onSeek,
  onChanged,
}: {
  event: CalendarEvent;
  all: CalendarEvent[];
  enrollments: Enrollment[];
  onSeek?: (s: number) => void;
  onChanged: () => void;
}) {
  const t = useTranslations("school.review");
  const types = useTranslations("calendar.types");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [date, setDate] = useState(dayKeyOf(event.starts_at));
  const [busy, setBusy] = useState(false);
  const subject = enrollments.find((e) => e.subjectId === event.subject_code);
  const original = event.conflict_of ? all.find((e) => e.id === event.conflict_of) : undefined;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  const quote = (event.origins ?? []).find((o) => o.quote)?.quote;
  const low = (event.confidence ?? 1) < 0.7;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 rounded-[12px] border bg-surface p-3", event.in_review ? "border-primary/40" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={TYPE_STYLE[event.type].color}>{types(event.type)}</Chip>
        {subject && <Chip color={subjectColor(subject.color)}>{subject.name}</Chip>}
        {!event.in_review && <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="size-3.5" /> {(event.origins?.length ?? 0) > 1 ? t("merged") : t("onCalendar")}</span>}
        {event.in_review && low && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <AlertTriangle className="size-3.5" aria-hidden /> {t("check")}
          </span>
        )}
      </div>

      {editing ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const [y, m, d] = date.split("-").map(Number);
            const start = new Date(event.starts_at);
            start.setFullYear(y, m - 1, d);
            act(async () => {
              await getRepo().events.update(event.id, { title: title.trim() || event.title, starts_at: start.toISOString(), in_review: false });
              setEditing(false);
            });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 min-w-0 flex-1 basis-48" dir="auto" aria-label={t("title")} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-auto" aria-label={t("date")} />
          <Button size="sm" className="h-9" type="submit" disabled={busy}>
            {t("save")}
          </Button>
        </form>
      ) : (
        <div>
          <p className="font-medium" dir="auto">
            {event.title}
          </p>
          <p className="text-sm text-muted">{original ? t("conflict", { saved: fmt(original.starts_at), found: fmt(event.starts_at) }) : t("due", { date: fmt(event.starts_at) })}</p>
          {quote && (
            <p className="mt-1 border-s-2 border-border ps-2 text-sm italic text-muted" dir="auto">
              “{quote}”
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(event.origins ?? []).map((o, i) => (
          <OriginChip key={i} o={o} onSeek={onSeek} />
        ))}
        {original &&
          (original.origins ?? []).map((o, i) => (
            <span key={`o${i}`} className="text-xs text-muted">
              {t("savedFrom")} <OriginChip o={o} onSeek={onSeek} />
            </span>
          ))}
        {event.in_review && !editing && (
          <span className="ms-auto flex flex-wrap gap-2">
            {original ? (
              <>
                <Button size="sm" disabled={busy} onClick={() => act(() => resolveConflict(event, original, "theirs"))}>
                  {t("useNew")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => resolveConflict(event, original, "mine"))}>
                  {t("keepSaved")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => act(() => getRepo().events.update(event.id, { in_review: false }))}>
                  <Check aria-hidden />
                  {t("accept")}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)} aria-label={t("edit")}>
                  <Pencil aria-hidden />
                  <span className="max-sm:sr-only">{t("edit")}</span>
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => getRepo().events.remove(event.id))} aria-label={t("dismiss")}>
                  <X aria-hidden />
                  <span className="max-sm:sr-only">{t("dismiss")}</span>
                </Button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
