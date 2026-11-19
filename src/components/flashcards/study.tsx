"use client";

import { Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/primitives";
import type { CardRow } from "@/lib/data/repo3";
import { GRADES, preview, Rating, untilLabel, type Grade } from "@/lib/flashcards/fsrs";
import { cn } from "@/lib/utils";

export type Mode = "flip" | "type" | "choice" | "match";

/** How close a typed answer is (0–1), ignoring case, accents and punctuation. */
function similarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y || y.includes(x) && x.length > y.length * 0.6) return 1;
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length);
}

function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** One study session over `queue` (flip / type / multiple choice), rating each card with FSRS. */
export function StudySession({
  queue,
  all,
  mode,
  onRate,
  onDone,
}: {
  queue: CardRow[];
  all: CardRow[];
  mode: Exclude<Mode, "match">;
  onRate: (card: CardRow, grade: Grade) => Promise<void>;
  onDone: (count: number) => void;
}) {
  const t = useTranslations("flashcards");
  const locale = useLocale();
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const card = queue[i];

  const options = useMemo(() => {
    if (!card) return [];
    const others = shuffle(all.filter((c) => c.id !== card.id && c.back !== card.back)).slice(0, 3).map((c) => c.back);
    return shuffle([card.back, ...others]);
  }, [card, all]);

  useEffect(() => {
    setRevealed(false);
    setTyped("");
    setPicked(null);
  }, [i]);

  if (!card) return null;
  const when = preview(card);
  let suggested: Grade | null = null;
  if (mode === "type" && revealed) {
    const s = similarity(typed, card.back);
    suggested = s >= 0.9 ? Rating.Good : s >= 0.6 ? Rating.Hard : Rating.Again;
  }
  if (mode === "choice" && picked) suggested = picked === card.back ? Rating.Good : Rating.Again;

  async function rate(g: Grade) {
    await onRate(card, g);
    if (i + 1 >= queue.length) onDone(queue.length);
    else setI(i + 1);
  }

  return (
    <div className="flex flex-col gap-4" data-testid="study">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted">{t("progress", { done: i + 1, total: queue.length })}</span>
      </div>

      <Card className="flex min-h-56 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xl font-semibold" dir="auto" data-testid="front">
          {card.front}
        </p>
        {mode === "flip" && revealed && (
          <p className="border-t border-border pt-4 text-lg text-text" dir="auto">
            {card.back}
          </p>
        )}
        {mode === "type" && (
          <form
            className="flex w-full max-w-md flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setRevealed(true);
            }}
          >
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("yourAnswer")} aria-label={t("yourAnswer")} disabled={revealed} dir="auto" autoFocus />
            {!revealed ? (
              <Button type="submit">{t("check")}</Button>
            ) : (
              <p className={cn("text-sm", suggested === Rating.Good ? "text-success" : "text-text")} dir="auto">
                {suggested === Rating.Good ? `✓ ${t("correct")}` : t("wrongWas", { answer: card.back })}
              </p>
            )}
          </form>
        )}
        {mode === "choice" && (
          <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={!!picked}
                onClick={() => {
                  setPicked(o);
                  setRevealed(true);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-[10px] border p-3 text-start text-sm transition-colors",
                  !picked && "border-border hover:border-primary/50",
                  picked && o === card.back && "border-success bg-success/10",
                  picked === o && o !== card.back && "border-danger bg-danger/10",
                )}
                dir="auto"
              >
                {picked && o === card.back && <Check className="size-4 shrink-0 text-success" />}
                {picked === o && o !== card.back && <X className="size-4 shrink-0 text-danger" />}
                {o}
              </button>
            ))}
          </div>
        )}
      </Card>

      {!revealed && mode === "flip" ? (
        <Button size="lg" onClick={() => setRevealed(true)} className="self-center">
          {t("show")}
        </Button>
      ) : revealed ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Rate">
          {GRADES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => rate(g)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-[10px] border px-2 py-2.5 text-sm font-semibold transition-colors",
                g === Rating.Again && "border-danger/40 text-danger hover:bg-danger/10",
                g === Rating.Hard && "border-warning/50 text-text hover:bg-warning/10",
                g === Rating.Good && "border-success/50 text-success hover:bg-success/10",
                g === Rating.Easy && "border-primary/40 text-primary hover:bg-primary-soft",
                suggested === g && "ring-2 ring-offset-1 ring-offset-background ring-current",
              )}
              data-testid={`rate-${g}`}
            >
              {t(`ratings.${g}` as "ratings.1")}
              <span className="text-[11px] font-normal text-muted">{untilLabel(when[g], new Date(), locale)}</span>
              {suggested === g && <span className="text-[10px] font-medium">{t("suggested")}</span>}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Match game: pair fronts with backs (practice only, no scheduling). */
export function MatchGame({ cards }: { cards: CardRow[] }) {
  const t = useTranslations("flashcards");
  const [round, setRound] = useState(0);
  const set = useMemo(() => shuffle(cards).slice(0, 6), [cards, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useMemo(() => shuffle(set.flatMap((c) => [{ id: c.id, side: "f" as const, text: c.front }, { id: c.id, side: "b" as const, text: c.back }])), [set]);
  const [sel, setSel] = useState<number | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<number[]>([]);
  const [start, setStart] = useState(() => Date.now());
  const finished = done.size === set.length && set.length > 0;

  function tap(k: number) {
    if (done.has(tiles[k].id) || k === sel) return;
    if (sel === null) return setSel(k);
    const a = tiles[sel];
    const b = tiles[k];
    if (a.id === b.id && a.side !== b.side) {
      setDone((d) => new Set(d).add(a.id));
      setSel(null);
    } else {
      setWrong([sel, k]);
      setSel(null);
      setTimeout(() => setWrong([]), 500);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("matchNote")}</p>
      {finished ? (
        <Card className="flex flex-col items-center gap-3 p-6">
          <p className="text-lg font-semibold text-success">{t("matchDone", { seconds: Math.round((Date.now() - start) / 1000) })}</p>
          <Button
            onClick={() => {
              setRound((r) => r + 1);
              setDone(new Set());
              setStart(Date.now());
            }}
          >
            {t("again")}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile, k) => (
            <button
              key={`${tile.id}-${tile.side}`}
              type="button"
              onClick={() => tap(k)}
              disabled={done.has(tile.id)}
              className={cn(
                "min-h-20 rounded-[10px] border p-3 text-sm transition-all",
                done.has(tile.id) ? "border-success/40 bg-success/10 text-muted opacity-50" : "border-border bg-surface hover:border-primary/50",
                sel === k && "border-primary bg-primary-soft",
                wrong.includes(k) && "animate-pulse border-danger bg-danger/10",
              )}
              dir="auto"
            >
              {tile.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
