"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { EventForm, blankEvent } from "@/components/calendar/event-form";
import { EventPanel } from "@/components/calendar/event-panel";
import { QuickAddBar, ReviewTray, SyncButton, WorkloadStrip } from "@/components/calendar/parts";
import { AgendaView, MonthView, TimeGridView, type View } from "@/components/calendar/views";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/drawer";
import { PageHeader } from "@/components/ui/primitives";
import { addDays, milestonesFor, monthGrid, startOfDay, startOfWeek } from "@/lib/calendar/logic";
import { intlLocale } from "@/lib/calendar/style";
import { useEvents } from "@/lib/calendar/use-events";
import type { CalendarEvent, NewEvent } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const VIEWS: View[] = ["month", "week", "day", "agenda"];

/** Smart calendar (section 5). Month view is the default; also Week, Day and Agenda. */
export default function CalendarPage() {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const enrollments = profile.enrollments;
  const { events, status, create, createMany, update, remove } = useEvents();

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial: NewEvent | CalendarEvent; id: string | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const review = useMemo(() => events.filter((e) => e.in_review), [events]);
  const opened = events.find((e) => e.id === openId) ?? null;

  /** New big submissions get their milestone chain right away (section 5). */
  async function add(e: NewEvent) {
    const row = await create(e);
    if (row.type === "submission" && !row.parent_id && new Date(row.starts_at) > addDays(new Date(), 5)) {
      await createMany(milestonesFor(row));
    }
    setToast(t("added", { title: row.title }));
  }

  function move(id: string, newStart: Date, allDay: boolean) {
    const e = events.find((x) => x.id === id);
    if (!e) return;
    const len = e.ends_at ? new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime() : 60 * 60 * 1000;
    update(id, {
      starts_at: newStart.toISOString(),
      all_day: allDay,
      ends_at: allDay ? null : new Date(newStart.getTime() + len).toISOString(),
    });
    setToast(t("moved", { date: newStart.toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" }) }));
  }

  function step(dir: 1 | -1) {
    setCursor((c) => {
      if (view === "month") return new Date(c.getFullYear(), c.getMonth() + dir, 1);
      if (view === "week") return addDays(c, 7 * dir);
      if (view === "day") return addDays(c, dir);
      return addDays(c, 14 * dir);
    });
  }

  const label = useMemo(() => {
    const L = intlLocale(locale);
    if (view === "month") return cursor.toLocaleDateString(L, { month: "long", year: "numeric" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      return `${s.toLocaleDateString(L, { day: "numeric", month: "short" })} – ${addDays(s, 6).toLocaleDateString(L, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(L, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [cursor, view, locale]);

  const stripFrom = view === "month" ? monthGrid(cursor)[0] : startOfWeek(cursor);
  const viewProps = {
    events,
    cursor,
    enrollments,
    onOpen: setOpenId,
    onMove: move,
    onPickDay: (d: Date) => {
      setCursor(d);
      setView("day");
    },
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <Button onClick={() => setForm({ initial: blankEvent(cursor), id: null })}>
            <Plus aria-hidden />
            {t("newEvent")}
          </Button>
        }
      />

      <QuickAddBar enrollments={enrollments} onAdd={add} />

      <ReviewTray
        items={review}
        enrollments={enrollments}
        onConfirm={(id) => update(id, { in_review: false })}
        onDismiss={(id) => remove(id)}
      />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label={t("prev")}>
              <ChevronLeft className="rtl:rotate-180" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label={t("next")}>
              <ChevronRight className="rtl:rotate-180" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
              {t("today")}
            </Button>
          </div>
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" aria-live="polite">
            {label}
          </h2>
          <div role="tablist" aria-label={t("title")} className="inline-flex rounded-[10px] bg-surface-2 p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium", view === v ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text")}
              >
                {t(v)}
              </button>
            ))}
          </div>
          <SyncButton />
        </div>

        <WorkloadStrip
          events={events}
          from={stripFrom}
          onPick={(d) => {
            setCursor(d);
            setView("week");
          }}
        />

        {status === "loading" ? (
          <p className="py-16 text-center text-muted">{t("loading")}</p>
        ) : view === "month" ? (
          <MonthView {...viewProps} />
        ) : view === "week" ? (
          <TimeGridView {...viewProps} days={7} />
        ) : view === "day" ? (
          <TimeGridView {...viewProps} days={1} />
        ) : (
          <AgendaView {...viewProps} />
        )}
      </section>

      <EventPanel
        event={opened}
        all={events}
        enrollments={enrollments}
        onClose={() => setOpenId(null)}
        onEdit={(e) => {
          setOpenId(null);
          setForm({ initial: e, id: e.id });
        }}
        onUpdate={update}
        onDelete={remove}
        onCreateMany={createMany}
        notify={setToast}
      />

      {form && (
        <EventForm
          open
          initial={form.initial}
          editingId={form.id}
          enrollments={enrollments}
          onClose={() => setForm(null)}
          onSave={async (e) => {
            if (form.id) await update(form.id, e);
            else await add(e);
          }}
        />
      )}

      <Toast message={toast} onDone={clearToast} />
    </>
  );
}
