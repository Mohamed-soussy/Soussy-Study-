"use client";

import { ArrowLeft, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { MatchGame, StudySession, type Mode } from "@/components/flashcards/study";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Drawer, Toast } from "@/components/ui/drawer";
import { Card, Chip, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import { getRepo3, type CardRow, type Deck } from "@/lib/data/repo3";
import type { VaultFile } from "@/lib/data/types";
import { isDue, review, untilLabel, type Grade } from "@/lib/flashcards/fsrs";
import { cn, subjectColor } from "@/lib/utils";

/** Flashcards with spaced repetition (section 12.1). */
function FlashcardsPage() {
  const t = useTranslations("flashcards");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const repo3 = getRepo3();

  const [decks, setDecks] = useState<Deck[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [study, setStudy] = useState<{ mode: Mode; queue: CardRow[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const reload = useCallback(async () => {
    setDecks(await repo3.decks.list());
    setCards(await repo3.cards.list());
  }, [repo3]);
  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);
  useEffect(() => {
    if (params.get("file")) setCreating(true);
  }, [params]);

  const deck = decks.find((d) => d.id === open);
  const deckCards = useMemo(() => cards.filter((c) => c.deck_id === open), [cards, open]);

  const stats = (id: string) => {
    const list = cards.filter((c) => c.deck_id === id);
    return { total: list.length, due: list.filter((c) => c.state !== 0 && isDue(c)).length, fresh: list.filter((c) => c.state === 0).length };
  };

  function startStudy(mode: Mode, practice = false) {
    if (mode === "match") return setStudy({ mode, queue: deckCards });
    const due = deckCards.filter((c) => isDue(c)).sort((a, b) => a.state - b.state || a.due.localeCompare(b.due));
    const queue = (due.length || !practice ? due : [...deckCards].sort((a, b) => a.due.localeCompare(b.due))).slice(0, 30);
    setDoneMsg(null);
    if (!queue.length) {
      const next = deckCards.map((c) => new Date(c.due)).sort((a, b) => +a - +b)[0];
      setDoneMsg(t("nothingDue", { when: next ? untilLabel(next, new Date(), locale) : "—" }));
      return;
    }
    setStudy({ mode, queue });
  }

  async function rate(card: CardRow, grade: Grade) {
    const { patch, log } = review(card, grade);
    setCards((l) => l.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
    await repo3.cards.update(card.id, patch);
    await repo3.reviews.create(log);
    if (grade === 1) {
      await repo3.mistakes.create({ source: "flashcards", subject: deck?.subject_code ?? null, topic: deck?.name ?? null, question: card.front, given: null, correct: card.back });
    }
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t("newDeck")}
          </Button>
        }
      />

      {!deck ? (
        decks.length === 0 ? (
          <EmptyState icon={<Layers className="size-8" />} title={t("empty")} className="py-16" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {decks.map((d) => {
              const s = stats(d.id);
              const subj = profile.enrollments.find((e) => e.subjectId === d.subject_code);
              return (
                <li key={d.id}>
                  <Card className="flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-md">
                    <button type="button" onClick={() => setOpen(d.id)} className="text-start text-lg font-semibold hover:text-primary" dir="auto">
                      {d.name}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {subj && <Chip color={subjectColor(subj.color)}>{subj.name}</Chip>}
                      <Chip>{t("total", { count: s.total })}</Chip>
                      {s.due > 0 && <Chip color="var(--danger)">{t("due", { count: s.due })}</Chip>}
                      {s.fresh > 0 && <Chip color="var(--primary)">{t("new", { count: s.fresh })}</Chip>}
                    </div>
                    <div className="mt-auto flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setOpen(d.id);
                          setTimeout(() => document.getElementById("study-modes")?.scrollIntoView({ block: "center" }), 50);
                        }}
                      >
                        {t("study")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpen(d.id)}>
                        {t("open")}
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <DeckView
          deck={deck}
          cards={deckCards}
          study={study}
          doneMsg={doneMsg}
          onBack={() => {
            setOpen(null);
            setStudy(null);
            setDoneMsg(null);
          }}
          onStudy={startStudy}
          onRate={rate}
          onStudyDone={(n) => {
            setStudy(null);
            const next = cards.filter((c) => c.deck_id === deck.id).map((c) => new Date(c.due)).sort((a, b) => +a - +b)[0];
            setDoneMsg(t("doneText", { count: n, when: next ? untilLabel(next, new Date(), locale) : "—" }));
          }}
          onAdd={async (front, back) => {
            const [c] = await repo3.cards.createMany([{ deck_id: deck.id, front, back }]);
            setCards((l) => [...l, c]);
          }}
          onRemoveCard={async (id) => {
            await repo3.cards.remove(id);
            setCards((l) => l.filter((c) => c.id !== id));
          }}
          onUpdateCard={async (id, p) => {
            await repo3.cards.update(id, p);
            setCards((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
          }}
          onDelete={async () => {
            await repo3.decks.remove(deck.id);
            setOpen(null);
            reload();
          }}
        />
      )}

      {creating && (
        <NewDeck
          initialFile={params.get("file") ?? ""}
          onClose={() => setCreating(false)}
          onCreated={async (d, count) => {
            setCreating(false);
            await reload();
            setOpen(d.id);
            setToast(t("deckMade", { count }));
          }}
          onToast={setToast}
        />
      )}
      <Toast message={toast} onDone={clearToast} />
    </>
  );
}

function DeckView({
  deck,
  cards,
  study,
  doneMsg,
  onBack,
  onStudy,
  onRate,
  onStudyDone,
  onAdd,
  onRemoveCard,
  onUpdateCard,
  onDelete,
}: {
  deck: Deck;
  cards: CardRow[];
  study: { mode: Mode; queue: CardRow[] } | null;
  doneMsg: string | null;
  onBack: () => void;
  onStudy: (m: Mode, practice?: boolean) => void;
  onRate: (c: CardRow, g: Grade) => Promise<void>;
  onStudyDone: (n: number) => void;
  onAdd: (front: string, back: string) => Promise<void>;
  onRemoveCard: (id: string) => Promise<void>;
  onUpdateCard: (id: string, p: Partial<CardRow>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const t = useTranslations("flashcards");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [confirm, setConfirm] = useState(false);
  const modes: Mode[] = ["flip", "type", "choice", "match"];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("back2")}
        </button>
        <h2 className="text-xl font-semibold" dir="auto">
          {deck.name}
        </h2>
        <Chip>{t("total", { count: cards.length })}</Chip>
      </div>

      <div id="study-modes" className="flex flex-wrap gap-2">
        {modes.map((m) => (
          <Button key={m} variant={study?.mode === m ? "primary" : "outline"} onClick={() => onStudy(m)} disabled={!cards.length || (m === "choice" && cards.length < 4) || (m === "match" && cards.length < 2)}>
            {t(`modes.${m}`)}
          </Button>
        ))}
      </div>

      {doneMsg && (
        <Card className="flex flex-wrap items-center gap-3 p-4" role="status">
          <p className="min-w-0 flex-1">{doneMsg}</p>
          <Button variant="ghost" size="sm" onClick={() => onStudy("flip", true)}>
            {t("studyAnyway")}
          </Button>
        </Card>
      )}

      {study && study.mode === "match" && <MatchGame cards={cards} />}
      {study && study.mode !== "match" && <StudySession queue={study.queue} all={cards} mode={study.mode} onRate={onRate} onDone={onStudyDone} />}

      {!study && (
        <>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!front.trim() || !back.trim()) return;
              await onAdd(front.trim(), back.trim());
              setFront("");
              setBack("");
            }}
          >
            <Input value={front} onChange={(e) => setFront(e.target.value)} placeholder={t("front")} aria-label={t("front")} dir="auto" />
            <Input value={back} onChange={(e) => setBack(e.target.value)} placeholder={t("back")} aria-label={t("back")} dir="auto" />
            <Button type="submit">
              <Plus aria-hidden />
              {t("addCard")}
            </Button>
          </form>
          <Card className="divide-y divide-border">
            {cards.map((c) => (
              <div key={c.id} className="grid items-center gap-2 p-3 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  defaultValue={c.front}
                  onBlur={(e) => e.target.value !== c.front && onUpdateCard(c.id, { front: e.target.value })}
                  aria-label={t("front")}
                  className="rounded-[8px] bg-transparent px-2 py-1 font-medium hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  dir="auto"
                />
                <input
                  defaultValue={c.back}
                  onBlur={(e) => e.target.value !== c.back && onUpdateCard(c.id, { back: e.target.value })}
                  aria-label={t("back")}
                  className="rounded-[8px] bg-transparent px-2 py-1 text-muted hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
                  dir="auto"
                />
                <button type="button" onClick={() => onRemoveCard(c.id)} className="justify-self-end p-1 text-muted hover:text-danger" aria-label={t("delete")}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </Card>
          {confirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">{t("deleteConfirm")}</span>
              <Button size="sm" className="bg-danger text-white" onClick={onDelete}>
                {t("delete")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                {t("cancel")}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className={cn("self-start text-danger")} onClick={() => setConfirm(true)}>
              <Trash2 aria-hidden />
              {t("delete")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function NewDeck({ initialFile, onClose, onCreated, onToast }: { initialFile: string; onClose: () => void; onCreated: (d: Deck, count: number) => void; onToast: (m: string) => void }) {
  const t = useTranslations("flashcards");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const repo3 = getRepo3();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState<"file" | "empty">(initialFile ? "file" : "file");
  const [fileId, setFileId] = useState(initialFile);
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRepo()
      .files.list()
      .then((f) => {
        const ready = f.filter((x) => x.status === "ready" && x.page_count);
        setFiles(ready);
        const pre = ready.find((x) => x.id === initialFile);
        if (pre) {
          setName(pre.topic || pre.name.replace(/\.[^.]+$/, ""));
          setSubject(pre.subject_code ?? "");
        }
      })
      .catch(() => {});
  }, [initialFile]);

  async function create() {
    setBusy(true);
    try {
      let cards: { front: string; back: string }[] = [];
      if (source === "file" && fileId) {
        const pages = await getRepo().chunks.pages(fileId);
        const res = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pages.map((p) => p.content).join("\n\n"), count, subject: profile.enrollments.find((e) => e.subjectId === subject)?.name, language: locale }),
        });
        if (res.status === 503) {
          onToast(t("aiOff"));
          return;
        }
        const data = (await res.json()) as { cards?: { front: string; back: string }[]; message?: string };
        if (!data.cards) {
          onToast(data.message ?? "?");
          return;
        }
        cards = data.cards;
      }
      const deck = await repo3.decks.create({ name: name.trim() || files.find((f) => f.id === fileId)?.name || t("newDeck"), subject_code: subject || null, source_file_id: source === "file" ? fileId || null : null });
      if (cards.length) await repo3.cards.createMany(cards.map((c) => ({ deck_id: deck.id, ...c })));
      onCreated(deck, cards.length);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={t("newDeck")}
      closeLabel={t("cancel")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={create} disabled={busy || (source === "file" && !fileId)}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {busy ? t("making") : t("create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("deckName")} htmlFor="deck-name">
          <Input id="deck-name" value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
        </Field>
        <Field label={t("subject")} htmlFor="deck-subject">
          <Select id="deck-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">{t("noSubject")}</option>
            {profile.enrollments.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          {(["file", "empty"] as const).map((s) => (
            <label key={s} className={cn("flex cursor-pointer items-start gap-3 rounded-[10px] border p-3", source === s ? "border-primary bg-primary-soft" : "border-border")}>
              <input type="radio" name="source" className="mt-1 accent-[var(--primary)]" checked={source === s} onChange={() => setSource(s)} />
              <span>
                <span className="block font-medium">{s === "file" ? t("fromFile") : t("emptyDeck")}</span>
                {s === "file" && <span className="text-sm text-muted">{t("fromFileHint")}</span>}
              </span>
            </label>
          ))}
        </fieldset>
        {source === "file" && (
          <>
            <Field label={t("file")} htmlFor="deck-file">
              <Select id="deck-file" value={fileId} onChange={(e) => setFileId(e.target.value)}>
                <option value="">—</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("howMany")} htmlFor="deck-count">
              <Input id="deck-count" type="number" min={4} max={30} value={count} onChange={(e) => setCount(Number(e.target.value) || 12)} />
            </Field>
          </>
        )}
      </div>
    </Drawer>
  );
}

export default function Page() {
  return (
    <Suspense>
      <FlashcardsPage />
    </Suspense>
  );
}
