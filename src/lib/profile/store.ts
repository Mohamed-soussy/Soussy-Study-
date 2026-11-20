"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Level } from "@/curriculum";
import { emptyProfile, type Enrollment, type Profile } from "./types";

/**
 * Loads and saves the student's profile.
 * - Supabase configured: `profiles` + `enrollments` tables (row-level security keeps rows private).
 * - Demo mode: this browser's localStorage only.
 */

const DEMO_KEY = "soussy.demo.profile";
const DEMO_SESSION_KEY = "soussy.demo.session";

export function hasDemoSession(): boolean {
  try {
    return localStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function startDemoSession() {
  try {
    localStorage.setItem(DEMO_SESSION_KEY, "1");
  } catch {
    /* storage blocked: demo still works for this page view */
  }
}

export function endDemoSession() {
  try {
    localStorage.removeItem(DEMO_SESSION_KEY);
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns the profile, or null when nobody is signed in. */
export async function loadProfile(): Promise<Profile | null> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    if (!hasDemoSession()) return null;
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      return raw ? { ...emptyProfile, ...(JSON.parse(raw) as Profile) } : { ...emptyProfile };
    } catch {
      return { ...emptyProfile };
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: row }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("enrollments").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const fallbackName = (user.user_metadata?.full_name as string | undefined) ?? undefined;
  if (!row) return { ...emptyProfile, fullName: fallbackName };

  return {
    termsVersion: row.terms_version ?? undefined,
    termsAcceptedAt: row.terms_accepted_at ?? undefined,
    fullName: row.full_name ?? fallbackName,
    dateOfBirth: row.date_of_birth ?? undefined,
    guardianEmail: row.guardian_email ?? undefined,
    country: row.country ?? undefined,
    city: row.city ?? undefined,
    school: row.school ?? undefined,
    curriculumCard: row.curriculum ?? undefined,
    packId: row.pack_id ?? undefined,
    year: row.year ?? undefined,
    examSession: row.exam_session ?? undefined,
    semester: row.semester ?? undefined,
    eeSubject: row.ee_subject ?? undefined,
    eeSupervisor: row.ee_supervisor ?? undefined,
    learningBlend: row.learning_blend ?? undefined,
    hoursPerWeek: row.hours_per_week ?? undefined,
    nextExamDate: row.next_exam_date ?? undefined,
    onboardingStep: row.onboarding_step ?? 0,
    onboardedAt: row.onboarded_at ?? undefined,
    role: row.role ?? "student",
    nickname: row.nickname ?? undefined,
    leaderboardOptIn: row.leaderboard_opt_in ?? false,
    leaderboardRealName: row.leaderboard_real_name ?? false,
    referralCode: row.referral_code ?? undefined,
    roomsGuardianOk: row.rooms_guardian_ok ?? false,
    enrollments: (rows ?? []).map(
      (r): Enrollment => ({
        subjectId: r.subject_code,
        name: r.subject_name,
        level: r.level as Level,
        color: r.color,
        targetGrade: r.target_grade ?? undefined,
        teacher: r.teacher_name ?? undefined,
        classCode: r.class_code ?? undefined,
      }),
    ),
  };
}

/** Saves the whole profile. Called after every onboarding step (section 3). */
export async function saveProfile(p: Profile): Promise<void> {
  const supabase = getSupabaseBrowser();
  if (!supabase) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(p));
    } catch {
      /* storage blocked: keep going in memory */
    }
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-signed-in");

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    terms_version: p.termsVersion ?? null,
    terms_accepted_at: p.termsAcceptedAt ?? null,
    full_name: p.fullName ?? null,
    date_of_birth: p.dateOfBirth || null,
    guardian_email: p.guardianEmail || null,
    country: p.country ?? null,
    city: p.city ?? null,
    school: p.school ?? null,
    curriculum: p.curriculumCard ?? null,
    pack_id: p.packId ?? null,
    year: p.year ?? null,
    exam_session: p.examSession ?? null,
    semester: p.semester ?? null,
    ee_subject: p.eeSubject || null,
    ee_supervisor: p.eeSupervisor || null,
    learning_blend: p.learningBlend ?? null,
    hours_per_week: p.hoursPerWeek ?? null,
    next_exam_date: p.nextExamDate || null,
    onboarding_step: p.onboardingStep,
    onboarded_at: p.onboardedAt ?? null,
    // Phase 6–7 settings: only sent once the student has set them (older databases lack the columns).
    ...(p.nickname !== undefined ? { nickname: p.nickname || null } : {}),
    ...(p.leaderboardOptIn !== undefined ? { leaderboard_opt_in: p.leaderboardOptIn } : {}),
    ...(p.leaderboardRealName !== undefined ? { leaderboard_real_name: p.leaderboardRealName } : {}),
    ...(p.referralCode !== undefined ? { referral_code: p.referralCode } : {}),
  });
  if (error) throw error;

  // Replace enrollments so removed subjects disappear.
  const { error: delError } = await supabase.from("enrollments").delete().eq("user_id", user.id);
  if (delError) throw delError;
  if (p.enrollments.length) {
    const { error: insError } = await supabase.from("enrollments").insert(
      p.enrollments.map((e) => ({
        user_id: user.id,
        subject_code: e.subjectId,
        subject_name: e.name,
        level: e.level,
        color: e.color,
        target_grade: e.targetGrade ?? null,
        teacher_name: e.teacher || null,
        class_code: e.classCode || null,
      })),
    );
    if (insError) throw insError;
  }
}

export async function signOut() {
  const supabase = getSupabaseBrowser();
  if (supabase) await supabase.auth.signOut();
  else endDemoSession();
}
