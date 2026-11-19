"use client";

import { Check, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import type { CustomTeacher, Prefs } from "@/lib/data/repo3";
import { CUSTOM_ID, TEACHERS, customTeacher, teacherFor, type Teacher } from "@/lib/teachers";
import { cn } from "@/lib/utils";

/** Original, simple illustrated avatar for each teacher (no real people, no copied art). */
export function TeacherAvatar({ teacher, size = 36 }: { teacher: Teacher; size?: number }) {
  const { skin, hair, shirt } = teacher.colors;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r="32" fill="var(--primary-soft)" />
      <path d="M10 64c2-13 11-19 22-19s20 6 22 19z" fill={shirt} />
      <circle cx="32" cy="28" r="13" fill={skin} />
      <path d="M19 27c0-9 6-14 13-14s13 5 13 14c-3-4-7-6-13-6s-10 2-13 6z" fill={hair} />
      <circle cx="27" cy="29" r="1.6" fill="#1f2937" />
      <circle cx="37" cy="29" r="1.6" fill="#1f2937" />
      <path d="M28 35c2.5 2 5.5 2 8 0" stroke="#1f2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {teacher.accessory === "glasses" && (
        <g stroke="#1f2937" strokeWidth="1.4" fill="none">
          <circle cx="27" cy="29" r="4" />
          <circle cx="37" cy="29" r="4" />
          <path d="M31 29h2" />
        </g>
      )}
      {teacher.accessory === "headset" && <path d="M18 30a14 14 0 0 1 28 0" stroke="#111827" strokeWidth="3" fill="none" />}
      {teacher.accessory === "whistle" && <circle cx="32" cy="50" r="3" fill="#FBBF24" stroke="#111827" strokeWidth="1" />}
      {teacher.accessory === "clipboard" && <rect x="40" y="44" width="11" height="14" rx="2" fill="#F8FAFC" stroke="#334155" strokeWidth="1.4" />}
      {teacher.accessory === "cap" && <path d="M18 22h28l-2-6H20z" fill={shirt} />}
    </svg>
  );
}

/**
 * The teacher button (section 6A.2): switch teacher any time, for all subjects or just this
 * one, or build your own. Saved to the student's settings.
 */
export function TeacherPicker({ prefs, subjectCode, subjectName, onChange }: { prefs: Prefs; subjectCode?: string | null; subjectName?: string; onChange: (p: Prefs) => void }) {
  const t = useTranslations("teachers");
  const locale = useLocale() as "en" | "ar";
  const [open, setOpen] = useState(false);
  const [build, setBuild] = useState(false);
  const [scope, setScope] = useState<"all" | "subject">("all");
  const [custom, setCustom] = useState<CustomTeacher>(prefs.customTeacher ?? { name: "", strictness: 3, humor: 3, slang: false, emoji: false, arabicMix: false, voicePitch: 1 });
  const ref = useRef<HTMLDivElement>(null);
  const current = teacherFor(prefs, subjectCode);

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function choose(id: string, extra: Partial<Prefs> = {}) {
    const next: Prefs = { ...prefs, ...extra };
    if (scope === "subject" && subjectCode) next.teacherBySubject = { ...(prefs.teacherBySubject ?? {}), [subjectCode]: id };
    else next.teacher = id;
    onChange(next);
    setOpen(false);
    setBuild(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pe-3 ps-1 text-sm font-medium hover:border-primary/40"
        data-testid="teacher-button"
      >
        <TeacherAvatar teacher={current} size={28} />
        {current.name[locale]}
        <ChevronDown className="size-3.5 text-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-full start-0 z-30 mb-2 flex w-[min(92vw,340px)] flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-xl">
          <p className="font-semibold">{t("title")}</p>
          {subjectCode && (
            <div role="radiogroup" className="inline-flex self-start rounded-[10px] bg-surface-2 p-1 text-xs">
              {(["all", "subject"] as const).map((sc) => (
                <button key={sc} type="button" role="radio" aria-checked={scope === sc} onClick={() => setScope(sc)} className={cn("rounded-[8px] px-2.5 py-1 font-medium", scope === sc ? "bg-surface text-primary shadow-sm" : "text-muted")}>
                  {sc === "all" ? t("allSubjects") : t("onlySubject", { subject: subjectName ?? "" })}
                </button>
              ))}
            </div>
          )}
          {!build ? (
            <ul className="flex flex-col gap-1">
              {[...TEACHERS, ...(prefs.customTeacher ? [customTeacher(prefs.customTeacher)] : [])].map((tc) => (
                <li key={tc.id}>
                  <button type="button" onClick={() => choose(tc.id)} className={cn("flex w-full items-center gap-3 rounded-[10px] p-2 text-start hover:bg-surface-2", current.id === tc.id && "bg-primary-soft")}>
                    <TeacherAvatar teacher={tc} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{tc.name[locale]}</span>
                      <span className="block truncate text-xs text-muted">{tc.tagline[locale]}</span>
                    </span>
                    {current.id === tc.id && <Check className="size-4 text-primary" aria-hidden />}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => setBuild(true)} className="w-full rounded-[10px] p-2 text-start text-sm font-medium text-primary hover:bg-surface-2">
                  + {t("build")}
                </button>
              </li>
            </ul>
          ) : (
            <form
              className="flex flex-col gap-2 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                choose(CUSTOM_ID, { customTeacher: custom });
              }}
            >
              <Input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder={t("name")} aria-label={t("name")} className="h-9" dir="auto" />
              {(["strictness", "humor"] as const).map((k) => (
                <label key={k} className="flex items-center justify-between gap-2">
                  {t(k)}
                  <input type="range" min={1} max={5} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: Number(e.target.value) })} className="w-32 accent-[var(--primary)]" />
                </label>
              ))}
              {(["slang", "emoji", "arabicMix"] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.checked })} />
                  {t(k)}
                </label>
              ))}
              <label className="flex items-center justify-between gap-2">
                {t("voice")}
                <input type="range" min={0.6} max={1.4} step={0.1} value={custom.voicePitch} onChange={(e) => setCustom({ ...custom, voicePitch: Number(e.target.value) })} className="w-32 accent-[var(--primary)]" />
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  {t("save")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBuild(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          )}
          <p className="text-[11px] text-muted">{t("note")}</p>
        </div>
      )}
    </div>
  );
}
