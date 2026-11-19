"use client";

import { Check, Copy, Link2, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Chip } from "@/components/ui/primitives";
import { addDays, loadLevel, startOfWeek, weeklyLoad } from "@/lib/calendar/logic";
import { parseQuickAdd } from "@/lib/calendar/quick-add";
import { eventColor, intlLocale, TYPE_STYLE } from "@/lib/calendar/style";
import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent, NewEvent } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

/** Plain-language quick-add with a live preview of what was understood (section 5). */
export function QuickAddBar({ enrollments, onAdd }: { enrollments: Enrollment[]; onAdd: (e: NewEvent) => Promise<void> }) {
  const t = useTranslations("calendar");
  const types = useTranslations("calendar.types");
  const locale = useLocale();
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const parsed = useMemo(() => parseQuickAdd(text, enrollments), [text, enrollments]);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });

  async function submit() {
    setTried(true);
    if (!parsed) return;
    await onAdd(parsed.event);
    setText("");
    setTried(false);
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="quick-add" className="sr-only">
        {t("quickAddLabel")}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Sparkles className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-primary" aria-hidden />
          <input
            id="quick-add"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTried(false);
            }}
            placeholder={t("quickAddPlaceholder")}
            autoComplete="off"
            className="h-12 w-full rounded-[12px] border border-border bg-surface ps-9 pe-3 text-base text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <Button type="submit" size="lg" disabled={!text.trim()}>
          <Plus aria-hidden />
          <span className="hidden sm:inline">{t("add")}</span>
        </Button>
      </div>
      {parsed && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite" data-testid="quick-add-preview">
          <Chip color={eventColor(parsed.event.type, parsed.event.subject_code, enrollments)}>{types(parsed.understood.type)}</Chip>
          {parsed.understood.subjectName && <Chip>{parsed.understood.subjectName}</Chip>}
          <Chip>
            {fmt.format(parsed.understood.date)}
            {parsed.understood.hasTime && ` · ${fmtTime.format(parsed.understood.date)}`}
          </Chip>
          <span className="truncate text-muted">“{parsed.event.title}”</span>
        </div>
      )}
      {!parsed && tried && text.trim() && <p className="text-xs text-danger">{t("quickAddNoDate")}</p>}
    </form>
  );
}

/** AI-found items wait here until the student confirms them (section 5). */
export function ReviewTray({
  items,
  enrollments,
  onConfirm,
  onDismiss,
}: {
  items: CalendarEvent[];
  enrollments: Enrollment[];
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const t = useTranslations("calendar");
  const sources = useTranslations("calendar.sources");
  const locale = useLocale();
  if (!items.length) return null;
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  return (
    <Card className="flex flex-col gap-3 border-warning/50 p-4">
      <div>
        <h2 className="font-semibold">{t("reviewTitle", { count: items.length })}</h2>
        <p className="text-sm text-muted">{t("reviewText")}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((e) => {
          const Icon = TYPE_STYLE[e.type].icon;
          return (
            <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-[10px] bg-surface-2/60 p-2.5">
              <Icon className="size-4 shrink-0" style={{ color: eventColor(e.type, e.subject_code, enrollments) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="text-xs text-muted">
                  {fmt.format(new Date(e.starts_at))} · {sources(e.source)}
                  {e.confidence != null && <> · {t("sure", { pct: Math.round(e.confidence * 100) })}</>}
                </p>
                {e.description && <p className="mt-0.5 line-clamp-2 text-xs italic text-muted">“{e.description}”</p>}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => onConfirm(e.id)}>
                  <Check aria-hidden />
                  {t("confirm")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDismiss(e.id)}>
                  <X aria-hidden />
                  {t("dismiss")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const LEVEL_BG = [
  "var(--surface-2)",
  "color-mix(in srgb, var(--warning) 30%, var(--surface))",
  "color-mix(in srgb, var(--warning) 60%, var(--surface))",
  "color-mix(in srgb, var(--danger) 70%, var(--surface))",
];

/** Workload heatmap: one bar per week so crunch weeks show early (section 5). */
export function WorkloadStrip({ events, from, weeks = 6, onPick }: { events: CalendarEvent[]; from: Date; weeks?: number; onPick: (d: Date) => void }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const data = useMemo(() => weeklyLoad(events, from, weeks), [events, from, weeks]);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short" });
  const thisWeek = startOfWeek(new Date()).getTime();
  return (
    <div className="flex flex-col gap-1.5" aria-label={t("workload")}>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-medium">{t("workload")}</span>
        <span className="flex items-center gap-2">
          {[t("calm"), t("busy"), t("crunch")].map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ background: LEVEL_BG[i === 0 ? 0 : i === 1 ? 2 : 3] }} aria-hidden />
              {label}
            </span>
          ))}
        </span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {data.map((w) => {
          const level = loadLevel(w.load);
          const label = t("weekOf", { date: fmt.format(w.week), count: w.count });
          return (
            <button
              type="button"
              key={w.week.getTime()}
              title={label}
              aria-label={label}
              onClick={() => onPick(w.week)}
              className={cn("h-2.5 rounded-full transition-transform hover:scale-y-150", w.week.getTime() === thisWeek && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
              style={{ background: LEVEL_BG[level] }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Private .ics link for Google Calendar, Outlook and Apple Calendar (section 5, "Sync out"). */
export function SyncButton() {
  const t = useTranslations("calendar.sync");
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const repo = getRepo();

  useEffect(() => {
    if (open && token === undefined) repo.icsToken().then(setToken).catch(() => setToken(null));
  }, [open, token, repo]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/ics/${token}.ics` : "";

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Link2 aria-hidden />
        {t("button")}
      </Button>
      {open && (
        <div className="absolute end-0 top-10 z-30 flex w-[min(92vw,360px)] flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-lg">
          <p className="font-semibold">{t("title")}</p>
          {repo.mode === "demo" ? (
            <p className="text-sm text-muted">{t("demo")}</p>
          ) : (
            <>
              <p className="text-sm text-muted">{t("text")}</p>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 w-full rounded-[8px] border border-border bg-surface-2 px-2 font-mono text-xs"
                aria-label={t("title")}
                dir="ltr"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      /* the field is selectable as a fallback */
                    }
                  }}
                  disabled={!url}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setToken(await repo.resetIcsToken());
                    setNotice(t("resetDone"));
                  }}
                >
                  <RefreshCw aria-hidden />
                  {t("reset")}
                </Button>
              </div>
              {notice && <p className="text-xs text-muted">{notice}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Weekday labels for the next N days, used by the agenda header. */
export function nextDays(n: number, from = new Date()) {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}
