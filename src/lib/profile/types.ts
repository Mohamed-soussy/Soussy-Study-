import type { Level } from "@/curriculum";

/** Current version of the plain-language terms summary (onboarding step 0). */
export const TERMS_VERSION = "2026-11-1";

export interface Enrollment {
  subjectId: string;
  name: string;
  level: Level;
  /** Subject color slot 0–7 (section 2). */
  color: number;
  targetGrade?: string;
  teacher?: string;
  classCode?: string;
}

/** How the student says they like to learn (step 4). Percentages add to 100. */
export interface LearningBlend {
  visual: number;
  steps: number;
  listening: number;
  peers: number;
}

/**
 * Everything onboarding collects. Stored in Supabase as `profiles` + `enrollments`
 * (supabase/migrations/0001_foundation.sql), or in this browser in demo mode.
 */
export interface Profile {
  termsVersion?: string;
  termsAcceptedAt?: string;

  fullName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  guardianEmail?: string;

  country?: string;
  city?: string;
  school?: string;

  /** School grade, asked before the curriculum: 6–12, or 13 for university / after school. */
  grade?: number;
  curriculumCard?: string;
  packId?: string;
  year?: string;
  examSession?: string;
  semester?: string;
  eeSubject?: string;
  eeSupervisor?: string;
  enrollments: Enrollment[];

  learningBlend?: LearningBlend;

  hoursPerWeek?: number;
  nextExamDate?: string;

  /** Set by the school or a moderator, never by the student (migrations 0006/0007). */
  role?: "student" | "teacher" | "moderator";
  /** Public name for the community vault, rooms, Squads and public leaderboards. */
  nickname?: string;
  leaderboardOptIn?: boolean;
  leaderboardRealName?: boolean;
  referralCode?: string;
  /** Set by a guardian's approval link (rooms for under-18s). Read-only for the student. */
  roomsGuardianOk?: boolean;

  /** Index of the next onboarding step, so a student resumes where they stopped. */
  onboardingStep: number;
  onboardedAt?: string;
}

export const emptyProfile: Profile = { enrollments: [], onboardingStep: 0 };

/** Age in whole years on a given day. */
export function ageOn(dateOfBirth: string, today = new Date()): number {
  const dob = new Date(dateOfBirth + "T00:00:00");
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Whole days from today until a YYYY-MM-DD date (negative if past). */
export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(date + "T00:00:00");
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}
