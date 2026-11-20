"use client";

import {
  BookOpenCheck,
  Camera,
  Check,
  Eye,
  Footprints,
  Headphones,
  Link2,
  MapPin,
  Pin,
  Plus,
  School,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, Chip, Field, Input, Select } from "@/components/ui/primitives";
import { curriculumCards, fitsGrade, getPack, GRADES, yearForGrade, type CurriculumPack, type Level, type SubjectDef } from "@/curriculum";
import { ageOn, daysUntil, TERMS_VERSION, type Enrollment, type LearningBlend, type Profile } from "@/lib/profile/types";
import { cn, subjectColor } from "@/lib/utils";

export interface StepProps {
  draft: Profile;
  update: (patch: Partial<Profile>) => void;
  /** True after the student pressed Continue with something missing. */
  showError: boolean;
  /** i18n key (under "onboarding") of the problem to show, if any. */
  errorKey: string | null;
}

/* ---------- shared bits ---------- */

function StepHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text sm:text-[28px]">{title}</h1>
      {lead && <p className="mt-1 text-muted">{lead}</p>}
    </div>
  );
}

function StepError({ errorKey }: { errorKey: string | null }) {
  const t = useTranslations("onboarding");
  if (!errorKey) return null;
  return (
    <p className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm font-medium text-danger" role="alert">
      {t(errorKey)}
    </p>
  );
}

/** Big tappable card used instead of dropdowns (section 3). */
function ChoiceCard({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-[var(--radius-card)] border bg-surface p-4 text-start transition-[border-color,box-shadow,background] duration-150 hover:shadow-md",
        selected ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Segmented control, e.g. HL / SL or DP1 / DP2. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[10px] bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[8px] font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm",
            value === o.value ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- step 0: terms ---------- */

export function TermsStep({ draft, update, errorKey }: StepProps) {
  const t = useTranslations("onboarding.terms");
  const items = [
    { icon: <BookOpenCheck />, title: t("collectTitle"), text: t("collect") },
    { icon: <ShieldOff />, title: t("neverTitle"), text: t("never") },
    { icon: <Camera />, title: t("cameraTitle"), text: t("camera") },
  ];
  const agreed = Boolean(draft.termsAcceptedAt) && draft.termsVersion === TERMS_VERSION;
  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <div className="flex flex-col gap-3">
        {items.map((i) => (
          <Card key={i.title} className="flex gap-3 p-4">
            <span className="mt-0.5 text-primary [&_svg]:size-5" aria-hidden>
              {i.icon}
            </span>
            <div>
              <p className="font-semibold text-text">{i.title}</p>
              <p className="text-sm text-muted">{i.text}</p>
            </div>
          </Card>
        ))}
      </div>
      <Link href="/legal" className="text-sm font-medium text-primary hover:underline">
        {t("readFull")}
      </Link>
      <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <input
          id="terms-agree"
          type="checkbox"
          className="mt-1 size-5 accent-[var(--primary)]"
          checked={agreed}
          onChange={(e) =>
            update(
              e.target.checked
                ? { termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION }
                : { termsAcceptedAt: undefined, termsVersion: undefined },
            )
          }
        />
        <span className="text-sm font-medium text-text">{t("agree")}</span>
      </label>
      <StepError errorKey={errorKey} />
    </>
  );
}

/* ---------- step 1: account ---------- */

export function AccountStep({ draft, update, errorKey }: StepProps) {
  const t = useTranslations("onboarding.account");
  const c = useTranslations("common");
  const age = draft.dateOfBirth ? ageOn(draft.dateOfBirth) : null;
  const needsGuardian = age !== null && !Number.isNaN(age) && age < 18;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <div className="flex flex-col gap-4">
        <Field label={t("fullName")} htmlFor="full-name">
          <Input
            id="full-name"
            autoComplete="name"
            value={draft.fullName ?? ""}
            onChange={(e) => update({ fullName: e.target.value })}
          />
        </Field>
        <Field label={t("dob")} htmlFor="dob">
          <Input
            id="dob"
            type="date"
            max={today}
            value={draft.dateOfBirth ?? ""}
            onChange={(e) => update({ dateOfBirth: e.target.value })}
          />
        </Field>
        {needsGuardian && (
          <Field
            label={t("guardianEmail")}
            htmlFor="guardian-email"
            hint={age! < 13 ? t("guardianUnder13") : t("guardianUnder18")}
          >
            <Input
              id="guardian-email"
              type="email"
              autoComplete="off"
              value={draft.guardianEmail ?? ""}
              onChange={(e) => update({ guardianEmail: e.target.value })}
            />
          </Field>
        )}
        {!needsGuardian && draft.guardianEmail && (
          <Field label={t("guardianEmail")} htmlFor="guardian-email" optional={c("optional")}>
            <Input id="guardian-email" type="email" value={draft.guardianEmail} onChange={(e) => update({ guardianEmail: e.target.value })} />
          </Field>
        )}
      </div>
      <StepError errorKey={errorKey} />
    </>
  );
}

/* ---------- step 2: school ---------- */

const COUNTRIES = [
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Egypt",
  "Jordan",
  "Lebanon",
  "Morocco",
  "Turkey",
  "Pakistan",
  "India",
  "United Kingdom",
  "Ireland",
  "France",
  "Germany",
  "Netherlands",
  "Spain",
  "United States",
  "Canada",
  "Australia",
  "Singapore",
  "Malaysia",
  "Other",
];

/** School directory. Starts with the first target school; grows with each school that joins. */
const SCHOOLS = [{ name: "Khalid International Schools (KiS), Riyadh", country: "Saudi Arabia", pinned: true }];

export function SchoolStep({ draft, update, errorKey }: StepProps) {
  const t = useTranslations("onboarding.school");
  const country = draft.country ?? "";

  // Defaults from section 3: Saudi Arabia, Riyadh.
  useEffect(() => {
    if (draft.country === undefined) update({ country: "Saudi Arabia", city: draft.city ?? "Riyadh" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listed = SCHOOLS.filter((s) => s.country === country);
  const isListed = listed.some((s) => s.name === draft.school);
  const [notListed, setNotListed] = useState(Boolean(draft.school) && !isListed);

  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("country")} htmlFor="country">
          <Input
            id="country"
            list="country-list"
            autoComplete="country-name"
            value={country}
            onChange={(e) => update({ country: e.target.value })}
          />
          <datalist id="country-list">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={t("city")} htmlFor="city">
          <Input id="city" value={draft.city ?? ""} onChange={(e) => update({ city: e.target.value })} />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-text">{t("school")}</legend>
        {listed.map((s) => (
          <ChoiceCard
            key={s.name}
            selected={draft.school === s.name}
            onClick={() => {
              setNotListed(false);
              update({ school: s.name });
            }}
          >
            <School className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span className="flex-1 font-medium text-text">{s.name}</span>
            {s.pinned && (
              <Chip>
                <Pin className="size-3" aria-hidden />
                {t("pinned")}
              </Chip>
            )}
          </ChoiceCard>
        ))}
        <ChoiceCard
          selected={notListed}
          onClick={() => {
            setNotListed(true);
            if (isListed) update({ school: "" });
          }}
        >
          <MapPin className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span className="font-medium text-text">{t("notListed")}</span>
        </ChoiceCard>
        {notListed && (
          <Field label={t("schoolName")} htmlFor="school-name">
            <Input
              id="school-name"
              autoFocus
              value={isListed ? "" : (draft.school ?? "")}
              onChange={(e) => update({ school: e.target.value })}
            />
          </Field>
        )}
      </fieldset>
      <StepError errorKey={errorKey} />
    </>
  );
}

/* ---------- step 3: curriculum ---------- */

/** IB exam sessions for the next 3 years: May and November. */
function examSessions(now = new Date()): string[] {
  const out: string[] = [];
  for (let y = now.getFullYear(); y <= now.getFullYear() + 2; y++) {
    if (new Date(y, 4, 1) > now) out.push(`May ${y}`);
    if (new Date(y, 10, 1) > now) out.push(`November ${y}`);
  }
  return out;
}

export function CurriculumStep({ draft, update, errorKey }: StepProps) {
  const t = useTranslations("onboarding.curriculum");
  const cards = useTranslations("curriculum.cards");
  const years = useTranslations("curriculum.years");
  const [query, setQuery] = useState("");
  const pack = getPack(draft.packId);
  const grade = draft.grade;

  // Curricula that have this grade come first, marked "Suggested".
  const visible = curriculumCards
    .filter((card) => {
      if (!query.trim()) return true;
      const hay = `${cards(card.id)} ${cards(`${card.id}Text`)}`.toLowerCase();
      return hay.includes(query.trim().toLowerCase());
    })
    .sort((x, y) => Number(fitsGrade(y.packId, grade)) - Number(fitsGrade(x.packId, grade)));

  function pick(cardId: string, packId: string) {
    if (packId === draft.packId) {
      update({ curriculumCard: cardId });
      return;
    }
    // A different pack means different subjects and years: start those fresh.
    update({ curriculumCard: cardId, packId, year: yearForGrade(packId, grade), examSession: undefined, semester: undefined, enrollments: [] });
  }

  function pickGrade(g: number) {
    update({ grade: g, ...(draft.packId ? { year: yearForGrade(draft.packId, g) ?? draft.year } : {}) });
  }

  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <section className="flex flex-col gap-2" aria-labelledby="grade-label">
        <h2 id="grade-label" className="text-sm font-semibold text-text">
          {t("gradeQuestion")}
        </h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="grade-label">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={grade === g}
              onClick={() => pickGrade(g)}
              className={cn(
                "min-h-10 rounded-[10px] border px-4 text-sm font-medium",
                grade === g ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface text-text hover:border-primary",
              )}
            >
              {g === 13 ? t("university") : t("grade", { n: g })}
            </button>
          ))}
        </div>
      </section>

      {grade !== undefined && (
        <>
      <h2 className="text-sm font-semibold text-text">{t("curriculumQuestion")}</h2>
      <Input type="search" placeholder={t("search")} aria-label={t("search")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((card) => (
          <ChoiceCard key={card.id} selected={draft.curriculumCard === card.id} onClick={() => pick(card.id, card.packId)}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">{cards(card.id)}</p>
              <p className="text-sm text-muted">{cards(`${card.id}Text`)}</p>
              {card.packId !== "custom" && fitsGrade(card.packId, grade) && <p className="mt-1 text-xs font-semibold text-primary">{t("suggested")}</p>}
            </div>
            {draft.curriculumCard === card.id && <Check className="size-5 shrink-0 text-primary" aria-hidden />}
          </ChoiceCard>
        ))}
      </div>

      {pack && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">{t("year")}</span>
            <Segmented
              label={t("year")}
              value={draft.year}
              onChange={(v) => update({ year: v })}
              options={pack.years.map((y) => ({ value: y.id, label: years(y.labelKey) }))}
            />
          </div>
          {(pack.id === "ib-dp" || pack.id === "ib-cp") && (
            <Field label={t("examSession")} htmlFor="exam-session">
              <Select id="exam-session" value={draft.examSession ?? ""} onChange={(e) => update({ examSession: e.target.value })}>
                <option value="" disabled>
                  —
                </option>
                {examSessions().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {pack.id === "american-hs" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text">{t("semester")}</span>
              <Segmented
                label={t("semester")}
                value={draft.semester}
                onChange={(v) => update({ semester: v })}
                options={[
                  { value: "fall", label: t("fall") },
                  { value: "spring", label: t("spring") },
                ]}
              />
            </div>
          )}
        </Card>
      )}
        </>
      )}
      <StepError errorKey={errorKey} />
    </>
  );
}

/* ---------- step 4: subjects ---------- */

function nextColor(enrollments: Enrollment[]): number {
  const used = new Set(enrollments.map((e) => e.color));
  for (let i = 0; i < 8; i++) if (!used.has(i)) return i;
  return enrollments.length % 8;
}

function defaultLevel(pack: CurriculumPack, def: SubjectDef, current: Enrollment[]): Level {
  if (pack.id === "ib-dp") {
    const hl = current.filter((e) => e.level === "HL").length;
    return def.levels.includes("HL") && hl < 3 ? "HL" : "SL";
  }
  return def.levels[0] ?? "None";
}

export function SubjectsStep({ draft, update, showError }: StepProps) {
  const t = useTranslations("onboarding.subjects");
  const c = useTranslations("common");
  const groupsT = useTranslations("curriculum.groups");
  const levelsT = useTranslations("curriculum.levels");
  const v = useTranslations("validation");
  const pack = getPack(draft.packId)!;
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const levelLabel = (l: Level) => (levelsT.has(l) ? levelsT(l) : l);

  const chosen = draft.enrollments;
  const issues = pack.validate(chosen);
  const isIb = pack.id === "ib-dp";
  const hl = chosen.filter((e) => e.level === "HL").length;
  const sl = chosen.filter((e) => e.level === "SL").length;

  // Search across every subject of the curriculum (names stay simple, e.g. "English B").
  const byGroup = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pack.groups
      .map((g) => ({ group: g, subjects: pack.subjects.filter((s) => s.group === g.id && (!q || s.name.toLowerCase().includes(q))) }))
      .filter((g) => g.subjects.length);
  }, [pack, query]);

  const setEnrollments = (enrollments: Enrollment[]) => update({ enrollments });

  function toggle(def: SubjectDef) {
    if (chosen.some((e) => e.subjectId === def.id)) {
      setEnrollments(chosen.filter((e) => e.subjectId !== def.id));
      if (draft.eeSubject === def.name) update({ eeSubject: undefined });
    } else {
      setEnrollments([
        ...chosen,
        { subjectId: def.id, name: def.name, level: defaultLevel(pack, def, chosen), color: nextColor(chosen) },
      ]);
    }
  }

  function setLevel(id: string, level: Level) {
    setEnrollments(chosen.map((e) => (e.subjectId === id ? { ...e, level } : e)));
  }

  function patch(id: string, p: Partial<Enrollment>) {
    setEnrollments(chosen.map((e) => (e.subjectId === id ? { ...e, ...p } : e)));
  }

  function addCustom() {
    const name = custom.trim();
    if (!name || chosen.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "-")}-${Date.now().toString(36)}`;
    setEnrollments([...chosen, { subjectId: id, name, level: "None", color: nextColor(chosen) }]);
    setCustom("");
  }

  const title = isIb ? t("titleIb") : pack.subjects.length ? t("titleList") : t("titleCustom");
  const lead = isIb ? t("leadIb") : pack.subjects.length ? t("leadList") : t("leadCustom");
  const customChosen = chosen.filter((e) => e.subjectId.startsWith("custom-"));

  return (
    <>
      <StepHeader title={title} lead={lead} />

      {/* Live status: counts and friendly rule messages (section 16: invalid HL/SL mix). */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 rounded-[var(--radius-card)] bg-background/95 px-1 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{isIb ? t("hlCount", { hl, sl, total: chosen.length }) : t("count", { count: chosen.length })}</Chip>
          {issues.length === 0 && chosen.length > 0 && (
            <Chip className="border-success/40 text-success">
              <Check className="size-3" aria-hidden />
              {t("allGood")}
            </Chip>
          )}
        </div>
        {issues.length > 0 && (chosen.length > 0 || showError) && (
          <ul className="flex flex-col gap-1 rounded-[10px] bg-warning/10 px-3 py-2 text-sm text-text" role="status" aria-live="polite">
            {issues.map((i, n) => (
              <li key={n}>{v(i.key, i.values ?? {})}</li>
            ))}
          </ul>
        )}
      </div>

      {pack.subjects.length > 0 && (
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search", { count: pack.subjects.length })} aria-label={t("search", { count: pack.subjects.length })} />
      )}
      {byGroup.length === 0 && query && <p className="text-sm text-muted">{t("noMatch")}</p>}

      {byGroup.map(({ group, subjects }) => (
        <section key={group.id} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{groupsT(group.labelKey)}</h2>
          <div className="flex flex-col gap-2">
            {subjects.map((def) => {
              const sel = chosen.find((e) => e.subjectId === def.id);
              return (
                <div
                  key={def.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border bg-surface p-2 ps-3 transition-colors",
                    sel ? "border-primary bg-primary-soft" : "border-border",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={Boolean(sel)}
                    onClick={() => toggle(def)}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-start"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-md border",
                        sel ? "border-transparent text-white" : "border-border",
                      )}
                      style={sel ? { background: subjectColor(sel.color) } : undefined}
                      aria-hidden
                    >
                      {sel && <Check className="size-3.5" />}
                    </span>
                    <span className="text-sm font-medium text-text">{def.name}</span>
                  </button>
                  {sel && def.levels.length > 1 && (
                    <Segmented
                      size="sm"
                      label={def.name}
                      value={sel.level}
                      onChange={(l) => setLevel(def.id, l)}
                      options={def.levels.map((l) => ({ value: l, label: levelLabel(l) }))}
                    />
                  )}
                  {sel && def.levels.length === 1 && def.levels[0] !== "None" && <Chip>{levelLabel(def.levels[0])}</Chip>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {pack.allowCustomSubjects && (
        <section className="flex flex-col gap-2">
          {pack.subjects.length > 0 && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("addCustom")}</h2>}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addCustom();
            }}
          >
            <Input
              id="custom-subject"
              aria-label={t("addCustom")}
              placeholder={t("addCustomPlaceholder")}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              type="submit"
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-surface-2 px-4 text-sm font-medium text-text hover:bg-border"
            >
              <Plus className="size-4" aria-hidden />
              {t("add")}
            </button>
          </form>
          {customChosen.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {customChosen.map((e) => (
                <li key={e.subjectId}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pe-1 ps-3 text-sm">
                    <span className="size-2 rounded-full" style={{ background: subjectColor(e.color) }} aria-hidden />
                    {e.name}
                    <button
                      type="button"
                      onClick={() => setEnrollments(chosen.filter((x) => x.subjectId !== e.subjectId))}
                      className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-text"
                      aria-label={`${c("remove")} ${e.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {isIb && (
        <Card className="flex flex-col gap-4 p-4">
          <p className="text-sm text-muted">{t("core")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("eeSubject")} htmlFor="ee-subject" optional={c("optional")}>
              <Select id="ee-subject" value={draft.eeSubject ?? ""} onChange={(e) => update({ eeSubject: e.target.value || undefined })}>
                <option value="">—</option>
                {chosen.map((e) => (
                  <option key={e.subjectId} value={e.name}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("eeSupervisor")} htmlFor="ee-supervisor" optional={c("optional")}>
              <Input id="ee-supervisor" value={draft.eeSupervisor ?? ""} onChange={(e) => update({ eeSupervisor: e.target.value })} />
            </Field>
          </div>
        </Card>
      )}

      {chosen.length > 0 && (
        <details className="group rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <summary className="cursor-pointer list-none font-medium text-text">
            {t("details")} <span className="text-sm font-normal text-muted">· {t("detailsHint")}</span>
          </summary>
          <div className="mt-4 flex flex-col gap-4">
            {chosen.map((e) => (
              <div key={e.subjectId} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
                <p className="flex items-center gap-2 text-sm font-medium text-text sm:pb-3">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: subjectColor(e.color) }} aria-hidden />
                  {e.name}
                </p>
                <Input
                  aria-label={`${t("teacher")} · ${e.name}`}
                  placeholder={t("teacher")}
                  value={e.teacher ?? ""}
                  onChange={(ev) => patch(e.subjectId, { teacher: ev.target.value })}
                />
                <Input
                  aria-label={`${t("classCode")} · ${e.name}`}
                  placeholder={t("classCode")}
                  value={e.classCode ?? ""}
                  onChange={(ev) => patch(e.subjectId, { classCode: ev.target.value })}
                />
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/* ---------- step 5: how you learn ---------- */

const STYLES = ["visual", "steps", "listening", "peers"] as const;
const STYLE_ICONS = { visual: Eye, steps: Footprints, listening: Headphones, peers: Users };
const STYLE_COLORS = { visual: "var(--primary)", steps: "var(--success)", listening: "var(--warning)", peers: "var(--event)" };

/** Turns 6 answers (0–3 = visual, steps, listening, peers) into percentages that add to 100. */
export function blendFromAnswers(answers: number[]): LearningBlend {
  const counts = [0, 0, 0, 0];
  answers.forEach((a) => counts[a]++);
  const exact = counts.map((n) => (n / answers.length) * 100);
  const floored = exact.map(Math.floor);
  let left = 100 - floored.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r)
    .forEach(({ i }) => {
      if (left > 0) {
        floored[i]++;
        left--;
      }
    });
  return { visual: floored[0], steps: floored[1], listening: floored[2], peers: floored[3] };
}

export function LearnStep({ draft, update, errorKey }: StepProps) {
  const t = useTranslations("onboarding.learn");
  const [answers, setAnswers] = useState<(number | undefined)[]>(Array(6).fill(undefined));

  function answer(q: number, a: number) {
    const next = [...answers];
    next[q] = a;
    setAnswers(next);
    if (next.every((x) => x !== undefined)) update({ learningBlend: blendFromAnswers(next as number[]) });
  }

  const blend = draft.learningBlend;

  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <ol className="flex flex-col gap-5">
        {[1, 2, 3, 4, 5, 6].map((q) => (
          <li key={q}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold text-text">
                {q}. {t(`q${q}`)}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["a", "b", "c", "d"] as const).map((letter, i) => (
                  <ChoiceCard key={letter} selected={answers[q - 1] === i} onClick={() => answer(q - 1, i)} className="p-3">
                    <span className="text-sm text-text">{t(`q${q}${letter}`)}</span>
                  </ChoiceCard>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {blend && (
        <Card className="flex flex-col gap-3 p-4" aria-live="polite">
          <p className="font-semibold text-text">{t("resultTitle")}</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
            {STYLES.map((s) => (
              <div key={s} style={{ width: `${blend[s]}%`, background: STYLE_COLORS[s] }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STYLES.map((s) => {
              const Icon = STYLE_ICONS[s];
              return (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <Icon className="size-4 shrink-0" style={{ color: STYLE_COLORS[s] }} aria-hidden />
                  <span className="text-text">{t(s)}</span>
                  <span className="ms-auto font-semibold tabular-nums text-text">{blend[s]}%</span>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-muted">{t("note")}</p>
        </Card>
      )}
      <StepError errorKey={errorKey} />
    </>
  );
}

/* ---------- step 6: goals ---------- */

export function GoalsStep({ draft, update }: StepProps) {
  const t = useTranslations("onboarding.goals");
  const levelsT = useTranslations("curriculum.levels");
  const pack = getPack(draft.packId);
  const hours = draft.hoursPerWeek ?? 8;
  const today = new Date().toISOString().slice(0, 10);

  function gradesFor(e: Enrollment): string[] {
    if (e.level === "AP") return ["5", "4", "3"]; // AP exams are scored 1–5
    return pack?.targetGrades ?? [];
  }

  function setTarget(id: string, targetGrade: string) {
    update({ enrollments: draft.enrollments.map((e) => (e.subjectId === id ? { ...e, targetGrade } : e)) });
  }

  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <Card className="divide-y divide-border">
        {draft.enrollments.map((e) => {
          const grades = gradesFor(e);
          return (
            <div key={e.subjectId} className="flex flex-wrap items-center gap-3 p-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: subjectColor(e.color) }} aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-medium text-text">
                {e.name}
                {e.level !== "None" && <span className="ms-2 text-muted">{levelsT(e.level)}</span>}
              </span>
              {grades.length ? (
                <Segmented
                  size="sm"
                  label={`${t("target")} · ${e.name}`}
                  value={e.targetGrade}
                  onChange={(g) => setTarget(e.subjectId, g)}
                  options={grades.map((g) => ({ value: g, label: g }))}
                />
              ) : (
                <Input
                  className="h-9 w-28"
                  aria-label={`${t("target")} · ${e.name}`}
                  placeholder={t("target")}
                  value={e.targetGrade ?? ""}
                  onChange={(ev) => setTarget(e.subjectId, ev.target.value)}
                />
              )}
            </div>
          );
        })}
      </Card>

      <Field label={t("hours")} htmlFor="hours">
        <div className="flex items-center gap-4">
          <input
            id="hours"
            type="range"
            min={1}
            max={40}
            value={hours}
            onChange={(e) => update({ hoursPerWeek: Number(e.target.value) })}
            className="flex-1 accent-[var(--primary)]"
          />
          <span className="w-14 text-end font-semibold tabular-nums text-text">{t("hoursValue", { hours })}</span>
        </div>
      </Field>

      <Field label={t("nextExam")} htmlFor="next-exam">
        <Input id="next-exam" type="date" min={today} value={draft.nextExamDate ?? ""} onChange={(e) => update({ nextExamDate: e.target.value })} />
      </Field>
    </>
  );
}

/* ---------- step 7: connect your school ---------- */

export function ConnectStep() {
  const t = useTranslations("onboarding.connect");
  const items = [
    { icon: <Users />, title: t("teams"), text: t("teamsText") },
    { icon: <School />, title: t("classroom"), text: t("classroomText") },
    { icon: <Link2 />, title: t("ics"), text: t("icsText") },
  ];
  return (
    <>
      <StepHeader title={t("title")} lead={t("lead")} />
      <div className="flex flex-col gap-3">
        {items.map((i) => (
          <Card key={i.title} className="flex items-start gap-3 p-4 opacity-80">
            <span className="mt-0.5 text-primary [&_svg]:size-5" aria-hidden>
              {i.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">{i.title}</p>
              <p className="text-sm text-muted">{i.text}</p>
            </div>
            <Chip className="shrink-0">{t("later")}</Chip>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------- finish ---------- */

export function FinishStep({ draft }: StepProps) {
  const t = useTranslations("onboarding.finish");
  const name = draft.fullName?.trim().split(/\s+/)[0] ?? "";
  const hl = draft.enrollments.filter((e) => e.level === "HL").length;
  const under13 = draft.dateOfBirth ? ageOn(draft.dateOfBirth) < 13 : false;
  const days = draft.nextExamDate ? daysUntil(draft.nextExamDate) : null;

  if (under13) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <ShieldCheck className="size-8 text-primary" aria-hidden />
        <h1 className="text-2xl font-bold">{t("pendingTitle")}</h1>
        <p className="text-muted">{t("pendingBody", { email: draft.guardianEmail ?? "" })}</p>
        <p className="rounded-[10px] bg-warning/10 p-3 text-sm text-text">{t("pendingMissing")}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold text-text">{t("welcome", { name })}</h1>
        <p className="text-lg text-muted">
          {draft.packId === "ib-dp"
            ? t("summaryIb", { count: draft.enrollments.length, hl })
            : t("summary", { count: draft.enrollments.length })}
          {days !== null && days >= 0 && <> {t("examIn", { days })}</>}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {draft.enrollments.map((e) => (
            <li key={e.subjectId}>
              <Chip color={subjectColor(e.color)}>{e.name}</Chip>
            </li>
          ))}
        </ul>
      </div>
      <Card className="flex flex-col gap-4 p-5">
        <p className="font-semibold text-text">{t("tourTitle")}</p>
        <ol className="flex flex-col gap-3">
          {[t("tour1"), t("tour2"), t("tour3")].map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-0.5 text-text">{text}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
