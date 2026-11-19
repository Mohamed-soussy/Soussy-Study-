"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, Input, Select } from "@/components/ui/primitives";
import { dayKey } from "@/lib/calendar/logic";
import { EVENT_TYPES } from "@/lib/calendar/style";
import { getRepo } from "@/lib/data/repo";
import type { CalendarEvent, EventStatus, EventType, NewEvent, VaultFile } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { cn } from "@/lib/utils";

export function blankEvent(day: Date): NewEvent {
  const d = new Date(day);
  d.setHours(8, 0, 0, 0);
  return {
    title: "",
    type: "homework",
    subject_code: null,
    starts_at: d.toISOString(),
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
    reminders: [4320, 1440, 0],
    parent_id: null,
    repeat_every_days: null,
    repeat_until: null,
    linked_file_ids: [],
  };
}

function timeOf(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function combine(day: string, time: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

/** The full event form (section 5): every field an event stores. */
export function EventForm({
  open,
  initial,
  editingId,
  enrollments,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: NewEvent | CalendarEvent;
  editingId: string | null;
  enrollments: Enrollment[];
  onClose: () => void;
  onSave: (e: NewEvent) => Promise<void>;
}) {
  const t = useTranslations("calendar.form");
  const types = useTranslations("calendar.types");
  const statusT = useTranslations("calendar.status");
  const [e, setE] = useState<NewEvent>(initial);
  const [day, setDay] = useState(dayKey(new Date(initial.starts_at)));
  const [start, setStart] = useState(initial.all_day ? "09:00" : timeOf(initial.starts_at));
  const [end, setEnd] = useState(initial.ends_at ? timeOf(initial.ends_at) : "10:00");
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setE(initial);
    setDay(dayKey(new Date(initial.starts_at)));
    setStart(initial.all_day ? "09:00" : timeOf(initial.starts_at));
    setEnd(initial.ends_at ? timeOf(initial.ends_at) : "10:00");
    setError(null);
  }, [initial]);

  useEffect(() => {
    if (open) getRepo().files.list().then(setFiles).catch(() => setFiles([]));
  }, [open]);

  const set = (patch: Partial<NewEvent>) => setE((x) => ({ ...x, ...patch }));
  const repeatMode = !e.repeat_every_days ? "none" : e.repeat_every_days === 7 ? "weekly" : "rotation";

  async function save() {
    if (!e.title.trim()) {
      setError(t("titleRequired"));
      return;
    }
    const startsAt = e.all_day ? combine(day, "08:00") : combine(day, start);
    const endsAt = e.all_day ? null : combine(day, end > start ? end : start);
    setSaving(true);
    try {
      await onSave({ ...e, title: e.title.trim(), starts_at: startsAt, ends_at: endsAt });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const toggleReminder = (m: number) =>
    set({ reminders: e.reminders.includes(m) ? e.reminders.filter((x) => x !== m) : [...e.reminders, m].sort((a, b) => b - a) });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editingId ? t("editTitle") : t("newTitle")}
      closeLabel={t("cancel")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          save();
        }}
      >
        <Field label={t("title")} htmlFor="ev-title" error={error ?? undefined}>
          <Input id="ev-title" autoFocus value={e.title} onChange={(x) => set({ title: x.target.value })} maxLength={200} />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("type")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((ty) => (
              <button
                key={ty}
                type="button"
                aria-pressed={e.type === ty}
                onClick={() => set({ type: ty as EventType, repeat_every_days: ty === "class" ? e.repeat_every_days ?? 7 : e.repeat_every_days })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  e.type === ty ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-text",
                )}
              >
                {types(ty)}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label={t("subject")} htmlFor="ev-subject">
          <Select id="ev-subject" value={e.subject_code ?? ""} onChange={(x) => set({ subject_code: x.target.value || null })}>
            <option value="">{t("noSubject")}</option>
            {enrollments.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("date")} htmlFor="ev-date">
            <Input id="ev-date" type="date" value={day} onChange={(x) => setDay(x.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium">
            <input id="ev-allday" type="checkbox" className="size-4 accent-[var(--primary)]" checked={e.all_day} onChange={(x) => set({ all_day: x.target.checked })} />
            {t("allDay")}
          </label>
        </div>
        {!e.all_day && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("start")} htmlFor="ev-start">
              <Input id="ev-start" type="time" value={start} onChange={(x) => setStart(x.target.value)} />
            </Field>
            <Field label={t("end")} htmlFor="ev-end">
              <Input id="ev-end" type="time" value={end} onChange={(x) => setEnd(x.target.value)} />
            </Field>
          </div>
        )}

        {e.type === "homework" && (
          <Field label={t("estimate")} htmlFor="ev-est">
            <Input
              id="ev-est"
              type="number"
              min={5}
              max={600}
              step={5}
              value={e.estimated_minutes ?? ""}
              onChange={(x) => set({ estimated_minutes: x.target.value ? Number(x.target.value) : null })}
            />
          </Field>
        )}

        {e.type === "event" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("location")} htmlFor="ev-loc">
              <Input id="ev-loc" value={e.location ?? ""} onChange={(x) => set({ location: x.target.value || null })} />
            </Field>
            <Field label={t("dressCode")} htmlFor="ev-dress">
              <Input id="ev-dress" value={e.dress_code ?? ""} onChange={(x) => set({ dress_code: x.target.value || null })} />
            </Field>
          </div>
        )}

        <Field label={t("repeat")} htmlFor="ev-repeat">
          <Select
            id="ev-repeat"
            value={repeatMode}
            onChange={(x) => set({ repeat_every_days: x.target.value === "none" ? null : x.target.value === "weekly" ? 7 : 6 })}
          >
            <option value="none">{t("repeatNone")}</option>
            <option value="weekly">{t("repeatWeekly")}</option>
            <option value="rotation">{t("repeatRotation")}</option>
          </Select>
        </Field>
        {repeatMode !== "none" && (
          <div className="grid grid-cols-2 gap-3">
            {repeatMode === "rotation" && (
              <Field label={t("repeatEvery")} htmlFor="ev-every">
                <Input
                  id="ev-every"
                  type="number"
                  min={2}
                  max={28}
                  value={e.repeat_every_days ?? 6}
                  onChange={(x) => set({ repeat_every_days: Math.min(28, Math.max(2, Number(x.target.value) || 6)) })}
                />
              </Field>
            )}
            <Field label={t("repeatUntil")} htmlFor="ev-until">
              <Input id="ev-until" type="date" value={e.repeat_until ?? ""} onChange={(x) => set({ repeat_until: x.target.value || null })} />
            </Field>
          </div>
        )}

        <Field label={t("description")} htmlFor="ev-desc">
          <textarea
            id="ev-desc"
            rows={3}
            value={e.description ?? ""}
            onChange={(x) => set({ description: x.target.value || null })}
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </Field>

        {editingId && (
          <Field label={t("status")} htmlFor="ev-status">
            <Select id="ev-status" value={e.status} onChange={(x) => set({ status: x.target.value as EventStatus })}>
              {(["todo", "in_progress", "done"] as const).map((s) => (
                <option key={s} value={s}>
                  {statusT(s)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("reminders")}</legend>
          {[
            [4320, t("r3d")],
            [1440, t("r1d")],
            [0, t("rMorning")],
          ].map(([m, label]) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={e.reminders.includes(m as number)} onChange={() => toggleReminder(m as number)} />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("files")}</legend>
          {files.length === 0 ? (
            <p className="text-sm text-muted">{t("noFiles")}</p>
          ) : (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {files.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={e.linked_file_ids.includes(f.id)}
                    onChange={() =>
                      set({
                        linked_file_ids: e.linked_file_ids.includes(f.id) ? e.linked_file_ids.filter((x) => x !== f.id) : [...e.linked_file_ids, f.id],
                      })
                    }
                  />
                  <span className="truncate">{f.name}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </form>
    </Drawer>
  );
}
