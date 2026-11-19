import type { Segment } from "@/lib/ai/engines";
import type { EventType } from "@/lib/data/types";
import type { MatchStatus } from "@/lib/school/match";
import type { ItemKind } from "@/prompts/lesson.v1";

export type { Segment };

/** One thing the analyzer found that the student must do or know a date for. */
export interface LessonItem {
  id: string;
  kind: ItemKind;
  title: string;
  details: string;
  /** The teacher's words for when ("for Thursday") and the date worked out from them. */
  due_text: string;
  due: string | null;
  how: "spoken" | "next-lesson" | "next-school-day" | "model" | "none";
  /** Seconds into the recording, and the exact words heard there. */
  at: number;
  quote: string;
  confidence: number;
  /** Cross-check with the calendar and Teams (section 11.2): New, Already there, Different date. */
  match: MatchStatus;
  /** The calendar item it became (or merged into). */
  event_id: string | null;
}

export interface KeyPoint {
  kind: "concept" | "stressed" | "question";
  text: string;
  at: number;
}

export interface Chapter {
  at: number;
  title: string;
}

export interface Slide {
  at: number;
  text: string;
}

export interface Lesson {
  id: string;
  title: string;
  subject_code: string | null;
  lesson_date: string; // YYYY-MM-DD
  media_name: string | null;
  media_kind: "video" | "audio" | "transcript" | null;
  duration_s: number | null;
  status: "processing" | "ready" | "error";
  error: string | null;
  transcript: (Segment & { speaker?: string })[];
  chapters: Chapter[];
  slides: Slide[];
  items: LessonItem[];
  key_points: KeyPoint[];
  summary: string | null;
  missed: string | null;
  created_at: string;
}

export type NewLesson = Pick<Lesson, "title" | "subject_code" | "lesson_date" | "media_name" | "media_kind">;

export const KIND_TO_TYPE: Record<ItemKind, EventType> = { homework: "homework", test: "test", deadline: "submission", announcement: "event" };

/** Where the recording itself is kept on this device (IndexedDB). */
export const mediaKey = (lessonId: string) => `lesson:${lessonId}`;
export const slideKey = (lessonId: string, n: number) => `lesson:${lessonId}:slide:${n}`;
