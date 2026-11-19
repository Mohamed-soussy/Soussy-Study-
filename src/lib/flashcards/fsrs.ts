import { fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { CardRow } from "@/lib/data/repo3";

/**
 * Spaced repetition with FSRS (section 12.1: "scheduling with the FSRS algorithm,
 * as in modern Anki"), using the official ts-fsrs implementation.
 * Target: remember 90% of cards when they come due; intervals up to 1 year (school scale).
 */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true }));

export { Rating };
export type { Grade };

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

function toCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** The row fields to save after a review. */
export function reviewPatch(c: Card): Partial<CardRow> {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

/** Applies one review and returns the new memory state plus a log entry. */
export function review(row: CardRow, grade: Grade, now = new Date()) {
  const { card, log } = scheduler.next(toCard(row), now, grade);
  return {
    patch: reviewPatch(card),
    log: { card_id: row.id, rating: grade as number, state: log.state as number, due: card.due.toISOString(), scheduled_days: card.scheduled_days, reviewed_at: now.toISOString() },
  };
}

/** When each button would bring the card back, for labels like "10 min" / "3 d". */
export function preview(row: CardRow, now = new Date()): Record<number, Date> {
  const p = scheduler.repeat(toCard(row), now);
  return Object.fromEntries(GRADES.map((g) => [g, p[g].card.due])) as Record<number, Date>;
}

/** Short human label for a time from now. */
export function untilLabel(due: Date, now = new Date(), locale = "en"): string {
  const ms = due.getTime() - now.getTime();
  const min = Math.round(ms / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar" : "en", { numeric: "always", style: "narrow" });
  if (min < 60) return rtf.format(Math.max(1, min), "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(h, "hour");
  const d = Math.round(h / 24);
  if (d < 31) return rtf.format(d, "day");
  return rtf.format(Math.round(d / 30), "month");
}

export function isDue(row: CardRow, now = new Date()) {
  return new Date(row.due) <= now;
}
