"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, Wordmark } from "@/components/brand/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { Button } from "@/components/ui/button";
import { getPack } from "@/curriculum";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { saveProfile } from "@/lib/profile/store";
import { ageOn, type Profile } from "@/lib/profile/types";
import { useProfile } from "@/lib/profile/use-profile";
import {
  AccountStep,
  ConnectStep,
  CurriculumStep,
  FinishStep,
  GoalsStep,
  LearnStep,
  SchoolStep,
  SubjectsStep,
  TermsStep,
  type StepProps,
} from "./steps";

/**
 * Onboarding (section 3). One question group per screen, a progress bar,
 * saved after every step, and a Back button. Students resume where they stopped.
 */
const STEPS = [
  TermsStep,
  AccountStep,
  SchoolStep,
  CurriculumStep,
  SubjectsStep,
  LearnStep,
  GoalsStep,
  ConnectStep,
  FinishStep,
] as const;
const COUNTED = STEPS.length - 1; // the welcome screen is not a "step"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an i18n key (under "onboarding") for the first problem on this step, or null. */
function checkStep(step: number, p: Profile): string | null {
  switch (step) {
    case 0:
      return p.termsAcceptedAt ? null : "terms.agree";
    case 1: {
      if (!p.fullName?.trim()) return "account.nameRequired";
      if (!p.dateOfBirth) return "account.dobRequired";
      const age = ageOn(p.dateOfBirth);
      if (Number.isNaN(age) || age < 3 || age > 100) return "account.dobInvalid";
      // No age restriction. A parent email is optional, but must look right if given.
      if (p.guardianEmail?.trim() && !EMAIL_RE.test(p.guardianEmail.trim())) return "account.guardianInvalid";
      return null;
    }
    case 2:
      return p.school?.trim() ? null : "school.schoolRequired";
    case 3:
      if (p.grade === undefined) return "curriculum.gradeRequired";
      return p.packId && p.year ? null : "curriculum.pickRequired";
    case 4: {
      const pack = getPack(p.packId);
      if (!pack) return "curriculum.pickRequired";
      return pack.validate(p.enrollments).length ? "__subjects" : null;
    }
    case 5:
      return p.learningBlend ? null : "learn.answerAll";
    default:
      return null;
  }
}

export function OnboardingFlow({ startStep }: { startStep?: number }) {
  const t = useTranslations("onboarding");
  const c = useTranslations("common");
  const router = useRouter();
  const reduce = useReducedMotion();
  const { profile, status } = useProfile();

  const [draft, setDraft] = useState<Profile | null>(null);
  const [step, setStep] = useState(0);
  const [showError, setShowError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Start from the saved step (or ?step= from Settings).
  useEffect(() => {
    if (status === "signed-out") router.replace("/sign-in");
    if (status === "ready" && profile && !draft) {
      // Came from a school page (e.g. /school/kis): pre-fill the school, city and curriculum.
      let preset: Partial<Profile> = {};
      try {
        preset = JSON.parse(localStorage.getItem("soussy.schoolPreset") ?? "{}") as Partial<Profile>;
      } catch {
        /* ignore */
      }
      setDraft(profile.school ? profile : { ...preset, ...profile, school: profile.school ?? preset.school, city: profile.city ?? preset.city, country: profile.country ?? preset.country });
      const resume = startStep ?? (profile.onboardedAt ? 0 : profile.onboardingStep);
      setStep(Math.min(Math.max(resume, 0), STEPS.length - 1));
    }
  }, [status, profile, draft, startStep, router]);

  if (!draft) {
    return <div className="flex min-h-dvh items-center justify-center text-muted">{c("loading")}</div>;
  }

  const update = (patch: Partial<Profile>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setShowError(false);
  };

  const error = checkStep(step, draft);

  async function goNext() {
    if (!draft) return;
    if (error) {
      setShowError(true);
      return;
    }
    const next = step + 1;
    const toSave: Profile = { ...draft, onboardingStep: Math.max(draft.onboardingStep, next) };
    setSaving(true);
    setSaveError(false);
    try {
      await saveProfile(toSave);
      setDraft(toSave);
      setStep(next);
      setShowError(false);
      window.scrollTo({ top: 0 });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    if (!draft) return;
    const done: Profile = { ...draft, onboardedAt: draft.onboardedAt ?? new Date().toISOString() };
    setSaving(true);
    try {
      await saveProfile(done);
      router.push("/home");
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  }

  const Step = STEPS[step];
  const isFinish = step === STEPS.length - 1;
  const props: StepProps = {
    draft,
    update,
    showError,
    errorKey: showError && error && error !== "__subjects" ? error : null,
  };

  return (
    <div className="flex min-h-dvh flex-col ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <header className="mx-auto flex w-full max-w-2xl flex-col gap-3 pt-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2">
            <Logo size={28} />
            <Wordmark />
          </span>
          <div className="flex items-center gap-2">
            {!isSupabaseConfigured && (
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-text">{c("demoMode")}</span>
            )}
            <LocaleSwitch />
          </div>
        </div>
        {!isFinish && (
          <div className="flex flex-col gap-1.5">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={COUNTED}
              aria-valuenow={step + 1}
            >
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${((step + 1) / COUNTED) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.25 }}
              />
            </div>
            <p className="text-xs text-muted">{t("progress", { current: step + 1, total: COUNTED })}</p>
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-6"
          >
            <Step {...props} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-background/95 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
          {saveError && (
            <p className="text-sm text-danger" role="alert">
              {c("saveFailed")}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
              <ArrowLeft className="rtl:rotate-180" aria-hidden />
              {c("back")}
            </Button>
            {step === 7 && (
              <Button variant="ghost" className="ms-auto" onClick={goNext} disabled={saving}>
                {c("skip")}
              </Button>
            )}
            {isFinish ? (
              <FinishAction draft={draft} saving={saving} onFinish={finish} />
            ) : (
              <Button size="lg" onClick={goNext} disabled={saving}>
                {saving ? c("saving") : c("continue")}
                {!saving && <ArrowRight className="rtl:rotate-180" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Under-13 accounts wait for a guardian (section 3, step 1), so there is no "Go" button. */
function FinishAction({ draft, saving, onFinish }: { draft: Profile; saving: boolean; onFinish: () => void }) {
  const t = useTranslations("onboarding.finish");
  const c = useTranslations("common");
  return (
    <Button size="lg" onClick={onFinish} disabled={saving}>
      {saving ? c("saving") : t("go")}
      {!saving && <ArrowRight className="rtl:rotate-180" aria-hidden />}
    </Button>
  );
}
