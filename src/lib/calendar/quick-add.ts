import * as chrono from "chrono-node";
import type { Enrollment } from "@/lib/profile/types";
import type { EventType, NewEvent } from "@/lib/data/types";

/**
 * Plain-language quick-add (section 5): "Chem test next Thursday on stoichiometry"
 * → a test, subject Chemistry, on next Thursday, about stoichiometry.
 * Runs in the browser with no AI call, so it is instant and free. English and Arabic.
 */

const TYPE_WORDS: [EventType, RegExp][] = [
  ["submission", /\b(ia|ee|extended essay|tok essay|essay|draft|portfolio|project|submission|lab report|coursework|nea)\b|مقال|مشروع|تسليم/i],
  ["test", /\b(test|exam|quiz|mock|final|midterm|paper\s?\d?|assessment)\b|اختبار|امتحان|كويز/i],
  ["homework", /\b(homework|hw|problem set|worksheet|reading|assignment|exercises?|questions?)\b|واجب|تمارين/i],
  ["event", /\b(trip|exhibition|mun|fair|assembly|event|cas|competition|ceremony|concert|match|game)\b|رحلة|معرض|فعالية|حفل/i],
  ["class", /\b(class|lesson|period|lecture|lab session)\b|حصة|درس/i],
  ["personal", /\b(study|revise|revision|review session|tutor(ing)?|practice)\b|مذاكرة|مراجعة|دراسة/i],
];

/** Short names students actually type, mapped to words found in official subject names. */
const SUBJECT_ALIASES: [RegExp, RegExp][] = [
  [/\bchem(istry)?\b|كيمياء/i, /chem/i],
  [/\bbio(logy)?\b|أحياء|احياء/i, /bio/i],
  [/\bphys(ics)?\b|فيزياء/i, /physics/i],
  [/\b(math|maths|calc(ulus)?|aa|ai|algebra|geometry|precalc|stats?)\b|رياضيات/i, /math|calc|algebra|geometry|stat/i],
  [/\becon(omics)?\b|اقتصاد/i, /econ/i],
  [/\b(eng|english|lit|lang ?lit)\b|إنجليزي|انجليزي/i, /english/i],
  [/\barabic\b|عربي/i, /arabic/i],
  [/\b(hist|history|apush)\b|تاريخ/i, /history/i],
  [/\bpsych(ology)?\b|علم النفس/i, /psych/i],
  [/\bgeo(graphy)?\b|جغرافيا/i, /geograph/i],
  [/\b(bm|business)\b|إدارة أعمال/i, /business/i],
  [/\b(cs|comp ?sci|computer science|coding)\b|حاسب|برمجة/i, /computer/i],
  [/\b(art|visual arts?)\b|فن/i, /art/i],
  [/\b(french)\b|فرنسي/i, /french/i],
  [/\b(spanish)\b|إسباني/i, /spanish/i],
  [/\b(islamic)\b|إسلامية|دين/i, /islamic/i],
  [/\b(ess|environment(al)?)\b|بيئة/i, /environment/i],
  [/\b(sehs|sports?)\b/i, /sport/i],
  [/\b(dt|design)\b|تصميم/i, /design/i],
  [/\b(gov|government|politics|gp)\b/i, /govern|politic/i],
];

/** Core IB parts that aren't enrollments but should still read as their own subject. */
const CORE: [RegExp, string, string][] = [
  [/\btok\b|نظرية المعرفة/i, "core-tok", "TOK"],
  [/\b(ee|extended essay)\b|المقال المطول/i, "core-ee", "Extended Essay"],
  [/\bcas\b/i, "core-cas", "CAS"],
];

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Minimal Arabic dates: اليوم, غدًا, بعد غد, weekdays (+ القادم for next week), or 12/3. */
function parseArabicDate(text: string, ref: Date): { date: Date; match: string } | null {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (/بعد غد/.test(text)) return { date: new Date(day(ref).getTime() + 2 * 864e5), match: "بعد غد" };
  if (/غدا|غدًا|بكرة|بكره/.test(text)) return { date: new Date(day(ref).getTime() + 864e5), match: text.match(/غدا|غدًا|بكرة|بكره/)![0] };
  if (/اليوم/.test(text)) return { date: day(ref), match: "اليوم" };
  for (let i = 0; i < 7; i++) {
    const name = AR_DAYS[i];
    const plain = name.replace("الإ", "الا");
    const re = new RegExp(`(يوم\\s+)?(${name}|${plain})(\\s+(القادم|الجاي))?`);
    const m = text.match(re);
    if (m) {
      // Same rule as English: "Thursday" = the next Thursday; "Thursday القادم" = Thursday of next week (weeks start Sunday).
      const diff = m[3] ? 7 - ref.getDay() + i : (i - ref.getDay() + 7) % 7 || 7;
      return { date: new Date(day(ref).getTime() + diff * 864e5), match: m[0] };
    }
  }
  const m = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const d = new Date(ref.getFullYear(), Number(m[2]) - 1, Number(m[1]));
    if (d < day(ref)) d.setFullYear(d.getFullYear() + 1);
    return { date: d, match: m[0] };
  }
  return null;
}

export interface QuickAddResult {
  event: NewEvent;
  /** Pieces we recognized, for the preview chip. */
  understood: { type: EventType; subjectName: string | null; date: Date; hasTime: boolean; topic: string | null };
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseQuickAdd(input: string, enrollments: Enrollment[], ref = new Date()): QuickAddResult | null {
  const text = input.trim();
  if (text.length < 3) return null;

  // 1. Date (English via chrono, then Arabic).
  let date: Date | null = null;
  let hasTime = false;
  let dateText = "";
  const parsed = chrono.parse(text, ref, { forwardDate: true });
  if (parsed.length) {
    date = parsed[0].start.date();
    hasTime = parsed[0].start.isCertain("hour");
    dateText = parsed[0].text;
  } else {
    const ar = parseArabicDate(text, ref);
    if (ar) {
      date = ar.date;
      dateText = ar.match;
    }
  }
  if (!date) return null;

  // 2. Type.
  const type = TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? "homework";

  // 3. Subject: the student's own enrollments first, then IB core.
  let subjectCode: string | null = null;
  let subjectName: string | null = null;
  for (const [alias, inName] of SUBJECT_ALIASES) {
    if (!alias.test(text)) continue;
    const hit = enrollments.find((e) => inName.test(e.name));
    if (hit) {
      subjectCode = hit.subjectId;
      subjectName = hit.name;
      break;
    }
  }
  if (!subjectCode) {
    const direct = enrollments.find((e) => text.toLowerCase().includes(e.name.toLowerCase()));
    if (direct) {
      subjectCode = direct.subjectId;
      subjectName = direct.name;
    }
  }
  if (!subjectCode) {
    const core = CORE.find(([re]) => re.test(text));
    if (core) {
      subjectCode = core[1];
      subjectName = core[2];
    }
  }

  // 4. Topic: whatever follows "on / about / for / عن / في" once the date is removed.
  const rest = text.replace(dateText, " ").replace(/\s+/g, " ").trim();
  const topicMatch = rest.match(/\b(?:on|about|covering|for)\s+(.+)$/i) ?? rest.match(/(?:عن|حول)\s+(.+)$/);
  let topic = topicMatch?.[1]?.trim().replace(/[.!]+$/, "") ?? null;
  if (topic && /^(the\s+)?(due|by)$/i.test(topic)) topic = null;

  // 5. Title: "Chemistry test: stoichiometry", or the student's own words if we can't do better.
  const typeWord: Record<EventType, string> = {
    test: "test",
    homework: "homework",
    submission: "submission",
    event: "event",
    class: "class",
    personal: "study block",
  };
  const shortSubject = subjectName?.split(":")[0].replace(/^Mathematics$/, "Math") ?? null;
  // Without a topic, keep the student's own words ("Physics IA draft"), with short names spelled out.
  let own = rest
    .replace(/\s*\b(due|by|on|is|at)\b\s*$/i, "")
    .replace(/\s+(due|by)\s+/gi, " ")
    .replace(/\bhw\b/gi, "homework")
    .trim();
  const arabic = /[\u0600-\u06ff]/.test(own);
  if (shortSubject && !arabic) {
    const alias = SUBJECT_ALIASES.find(([a]) => a.test(own))?.[0];
    if (alias && !own.toLowerCase().includes(shortSubject.toLowerCase())) own = own.replace(alias, shortSubject);
  }
  const title = topic && subjectName && !arabic ? `${shortSubject} ${typeWord[type]}: ${topic}` : cap(own || text);

  const startsAt = new Date(date);
  if (!hasTime) startsAt.setHours(8, 0, 0, 0);

  return {
    event: {
      title: title.slice(0, 200),
      type,
      subject_code: subjectCode,
      starts_at: startsAt.toISOString(),
      ends_at: hasTime ? new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString() : null,
      all_day: !hasTime,
      description: topic,
      location: null,
      dress_code: null,
      estimated_minutes: type === "homework" ? 45 : null,
      source: "manual",
      confidence: null,
      status: "todo",
      in_review: false,
      reminders: [4320, 1440, 0],
      parent_id: null,
      repeat_every_days: type === "class" ? 7 : null,
      repeat_until: null,
      linked_file_ids: [],
    },
    understood: { type, subjectName, date: startsAt, hasTime, topic },
  };
}
