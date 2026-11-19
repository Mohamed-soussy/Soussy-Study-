import * as chrono from "chrono-node";
import { addDays, occurrences, startOfDay } from "@/lib/calendar/logic";
import { parseArabicDate } from "@/lib/calendar/quick-add";
import type { CalendarEvent } from "@/lib/data/types";

/** KiS and most Saudi schools: Sunday to Thursday. */
const SCHOOL_DAYS = new Set([0, 1, 2, 3, 4]);

function nextSchoolDay(from: Date): Date {
  let d = addDays(startOfDay(from), 1);
  while (!SCHOOL_DAYS.has(d.getDay())) d = addDays(d, 1);
  return d;
}

const NEXT_LESSON = /\b(next|following)\s+(lesson|class|period|session|time\s+we\s+meet)\b|\bnext time\b|(ال|لل)حصة\s+(القادمة|الجاية)|الدرس\s+القادم|المرة\s+(القادمة|الجاية)/i;

export interface ResolvedDue {
  date: Date | null;
  /** How the date was worked out, shown next to low-confidence items. */
  how: "spoken" | "next-lesson" | "next-school-day" | "model" | "none";
  /** Multiply the item's confidence by this. */
  certainty: number;
}

/**
 * Turns what the teacher said ("for Thursday", "next lesson", "by the 14th") into a real
 * date, counting from the day of the lesson, not today (section 11.2). Runs in code, not
 * in the AI, so it is exact and the same every time; the AI's own guess is the fallback.
 */
export function resolveDue(
  dueText: string,
  modelDate: string,
  lessonDate: Date,
  opts: { subjectCode?: string | null; events?: CalendarEvent[] } = {},
): ResolvedDue {
  const ref = new Date(lessonDate.getFullYear(), lessonDate.getMonth(), lessonDate.getDate(), 12);
  const text = dueText.trim();
  const limit = addDays(ref, 200);
  const ok = (d: Date) => d >= startOfDay(ref) && d <= limit;

  if (text) {
    if (NEXT_LESSON.test(text)) {
      // The next time this class meets on the calendar, else the next school day.
      if (opts.subjectCode && opts.events?.length) {
        const classes = occurrences(
          opts.events.filter((e) => e.type === "class" && e.subject_code === opts.subjectCode),
          addDays(startOfDay(ref), 1),
          addDays(ref, 21),
        ).sort((a, b) => a.start.getTime() - b.start.getTime());
        if (classes[0]) return { date: startOfDay(classes[0].start), how: "next-lesson", certainty: 0.95 };
      }
      return { date: nextSchoolDay(ref), how: "next-school-day", certainty: 0.6 };
    }
    if (/\btomorrow\b|غد|بكرة|بكره/i.test(text) && !/بعد غد/.test(text)) return { date: addDays(startOfDay(ref), 1), how: "spoken", certainty: 1 };
    const en = chrono.parse(text, ref, { forwardDate: true })[0];
    if (en) {
      const d = en.start.date();
      if (ok(d)) return { date: en.start.isCertain("hour") ? d : startOfDay(d), how: "spoken", certainty: 1 };
    }
    // "by the 14th": the next 14th on or after the lesson.
    const dom = text.match(/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i);
    if (dom) {
      const n = Number(dom[1]);
      if (n >= 1 && n <= 31) {
        let d = new Date(ref.getFullYear(), ref.getMonth(), n);
        if (d < startOfDay(ref) || d.getDate() !== n) d = new Date(ref.getFullYear(), ref.getMonth() + 1, n);
        if (ok(d)) return { date: d, how: "spoken", certainty: 1 };
      }
    }
    const ar = parseArabicDate(text, ref);
    if (ar && ok(ar.date)) return { date: ar.date, how: "spoken", certainty: 1 };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(modelDate)) {
    const [y, m, d] = modelDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (ok(date)) return { date, how: "model", certainty: 0.75 };
  }
  return { date: null, how: "none", certainty: 0.5 };
}

/** "34:12" or "1:02:05" ⇄ seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function parseClock(t: string): number | null {
  const parts = t.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n)) || parts.length < 2 || parts.length > 3) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
