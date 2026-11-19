"use client";

import { CalendarClock, Check, Clock, FileText, Layers, MapPin, Pencil, Repeat, Shirt, Trash2, Wand2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Chip, Field, Input } from "@/components/ui/primitives";
import { milestonesFor, rebalance, startOfDay, studySprint } from "@/lib/calendar/logic";
import { eventColor, intlLocale, TYPE_STYLE } from "@/lib/calendar/style";
import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent, EventStatus, NewEvent, VaultFile } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

/** Event details in a side panel, with the special actions for tests and big submissions (section 5). */
export function EventPanel({
  event,
  all,
  enrollments,
  onClose,
  onEdit,
  onUpdate,
  onDelete,
  onCreateMany,
  notify,
}: {
  event: CalendarEvent | null;
  all: CalendarEvent[];
  enrollments: Enrollment[];
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onUpdate: (id: string, patch: Partial<CalendarEvent>) => void;
  onDelete: (id: string) => void;
  onCreateMany: (list: NewEvent[]) => Promise<unknown>;
  notify: (msg: string) => void;
}) {
  const t = useTranslations("calendar.panel");
  const c = useTranslations("calendar");
  const types = useTranslations("calendar.types");
  const statusT = useTranslations("calendar.status");
  const sources = useTranslations("calendar.sources");
  const sprintT = useTranslations("calendar.sprint");
  const msT = useTranslations("calendar.milestones");
  const locale = useLocale();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [units, setUnits] = useState("");
  const [files, setFiles] = useState<VaultFile[]>([]);

  useEffect(() => {
    setConfirmDelete(false);
    setUnits(event?.description ?? "");
    if (event?.linked_file_ids.length) getRepo().files.list().then(setFiles).catch(() => setFiles([]));
  }, [event]);

  const children = useMemo(() => (event ? all.filter((x) => x.parent_id === event.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : []), [all, event]);

  if (!event) return null;
  const color = eventColor(event.type, event.subject_code, enrollments);
  const Icon = TYPE_STYLE[event.type].icon;
  const subject = enrollments.find((s) => s.subjectId === event.subject_code)?.name;
  const start = new Date(event.starts_at);
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(event.all_day ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
  const fmtShort = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" });
  const isFuture = startOfDay(start) > startOfDay(new Date());
  const missed = children.filter((x) => x.status !== "done" && startOfDay(new Date(x.starts_at)) < startOfDay(new Date()));

  async function buildSprint() {
    const list = studySprint(event!, all, { units: units.split(/[,،\n]/).map((u) => u.trim()).filter(Boolean) });
    await onCreateMany(list);
    notify(sprintT("built", { count: list.length }));
  }

  async function makeMilestones() {
    const list = milestonesFor(event!);
    await onCreateMany(list);
    notify(msT("made", { count: list.length }));
  }

  function doRebalance() {
    const moves = rebalance(children, start);
    moves.forEach((m) => onUpdate(m.id, { starts_at: m.starts_at }));
    notify(sprintT("rebalanced", { count: moves.length }));
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={event.title}
      closeLabel={t("close")}
      footer={
        confirmDelete ? (
          <>
            <span className="me-auto text-sm text-text">{t("deleteConfirm")}</span>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {c("form.cancel")}
            </Button>
            <Button
              className="bg-danger text-white"
              onClick={() => {
                onDelete(event.id);
                onClose();
              }}
            >
              {t("yesDelete")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="me-auto text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
            <Button variant="outline" onClick={() => onEdit(event)}>
              <Pencil aria-hidden />
              {t("edit")}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip color={color}>
            <Icon className="size-3" aria-hidden />
            {types(event.type)}
          </Chip>
          {subject && <Chip>{subject}</Chip>}
          {event.source !== "manual" && <Chip>{t("source", { source: sources(event.source) })}</Chip>}
        </div>

        <ul className="flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2">
            <CalendarClock className="size-4 text-muted" aria-hidden />
            {fmt.format(start)}
          </li>
          {event.estimated_minutes && (
            <li className="flex items-center gap-2">
              <Clock className="size-4 text-muted" aria-hidden />
              {t("minutes", { minutes: event.estimated_minutes })}
            </li>
          )}
          {event.location && (
            <li className="flex items-center gap-2">
              <MapPin className="size-4 text-muted" aria-hidden />
              {event.location}
            </li>
          )}
          {event.dress_code && (
            <li className="flex items-center gap-2">
              <Shirt className="size-4 text-muted" aria-hidden />
              {t("dress", { value: event.dress_code })}
            </li>
          )}
          {event.repeat_every_days && (
            <li className="flex items-center gap-2">
              <Repeat className="size-4 text-muted" aria-hidden />
              {t("repeats", { days: event.repeat_every_days })}
            </li>
          )}
        </ul>
        {event.description && <p className="whitespace-pre-wrap rounded-[10px] bg-surface-2/60 p-3 text-sm">{event.description}</p>}

        {/* Status: tap to tick off (satisfying check-off, section 2A). */}
        <div role="radiogroup" aria-label={c("form.status")} className="inline-flex gap-1 self-start rounded-[10px] bg-surface-2 p-1">
          {(["todo", "in_progress", "done"] as EventStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={event.status === s}
              onClick={() => onUpdate(event.id, { status: s })}
              className={cn(
                "inline-flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-sm font-medium",
                event.status === s ? (s === "done" ? "bg-success text-white" : "bg-surface text-primary shadow-sm") : "text-muted hover:text-text",
              )}
            >
              {s === "done" && <Check className="size-3.5" aria-hidden />}
              {statusT(s)}
            </button>
          ))}
        </div>

        {files.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t("linked")}</h3>
            {files
              .filter((f) => event.linked_file_ids.includes(f.id))
              .map((f) => (
                <Link key={f.id} href={`/hub/file/${f.id}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <FileText className="size-4" aria-hidden />
                  {f.name}
                </Link>
              ))}
          </section>
        )}

        {/* Tests: AI study sprint. */}
        {event.type === "test" && isFuture && children.length === 0 && (
          <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-primary/30 bg-primary-soft/60 p-4">
            <div className="flex items-start gap-2">
              <Wand2 className="mt-0.5 size-5 text-primary" aria-hidden />
              <div>
                <h3 className="font-semibold">{sprintT("ask")}</h3>
                <p className="text-sm text-muted">{sprintT("text")}</p>
              </div>
            </div>
            <Field label={sprintT("units")} htmlFor="sprint-units" hint={sprintT("unitsHint")}>
              <Input id="sprint-units" value={units} onChange={(e) => setUnits(e.target.value)} />
            </Field>
            <p className="text-xs text-muted">{sprintT("weakLater")}</p>
            <Button onClick={buildSprint} className="self-start">
              {sprintT("build")}
            </Button>
          </section>
        )}

        {/* Big submissions: milestone chain. */}
        {event.type === "submission" && !event.parent_id && isFuture && children.length === 0 && (
          <Button variant="outline" onClick={makeMilestones} className="self-start">
            <Layers aria-hidden />
            {msT("make")}
          </Button>
        )}

        {children.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("subtasks")}</h3>
              {missed.length > 0 && (
                <Button size="sm" variant="ghost" onClick={doRebalance}>
                  {sprintT("rebalance")}
                </Button>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {children.map((x) => (
                <li key={x.id}>
                  <label className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--success)]"
                      checked={x.status === "done"}
                      onChange={() => onUpdate(x.id, { status: x.status === "done" ? "todo" : "done" })}
                    />
                    <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{fmtShort.format(new Date(x.starts_at))}</span>
                    <span className={cn("min-w-0 flex-1 truncate", x.status === "done" && "text-muted line-through")}>{x.title}</span>
                    {x.estimated_minutes && <span className="text-xs text-muted">{x.estimated_minutes}′</span>}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}
