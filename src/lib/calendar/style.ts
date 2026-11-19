import { BookOpen, ClipboardCheck, Flag, GraduationCap, Send, Sparkles, type LucideIcon } from "lucide-react";
import type { EventType } from "@/lib/data/types";
import type { Enrollment } from "@/lib/profile/types";
import { subjectColor } from "@/lib/utils";

/** Each event type's color and icon (section 5 table). */
export const TYPE_STYLE: Record<EventType, { color: string; icon: LucideIcon }> = {
  test: { color: "var(--danger)", icon: ClipboardCheck },
  homework: { color: "var(--primary)", icon: BookOpen },
  submission: { color: "var(--submission)", icon: Send },
  event: { color: "var(--event)", icon: Flag },
  class: { color: "var(--muted)", icon: GraduationCap },
  personal: { color: "var(--primary)", icon: Sparkles }, // replaced by the subject color below
};

export const EVENT_TYPES: EventType[] = ["test", "homework", "submission", "event", "class", "personal"];

/** Personal items take their subject's color (section 5). */
export function eventColor(type: EventType, subjectCode: string | null, enrollments: Enrollment[]): string {
  if (type === "personal") {
    const e = enrollments.find((x) => x.subjectId === subjectCode);
    return e ? subjectColor(e.color) : "var(--success)";
  }
  return TYPE_STYLE[type].color;
}

/** Gregorian calendar and Latin digits for Arabic, matching school timetables. */
export function intlLocale(locale: string) {
  return locale === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB";
}
