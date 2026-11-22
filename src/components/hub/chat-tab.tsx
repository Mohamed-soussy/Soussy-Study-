"use client";

import {
  ArrowLeft,
  BookOpen,
  CalendarPlus,
  Check,
  Copy,
  FileText,
  Layers,
  Link2,
  MessageSquarePlus,
  Mic,
  PenTool,
  Send,
  Square,
  Trash2,
  Volume2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { UploadFromDevice } from "@/components/hub/upload-from-device";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/drawer";
import { Card, Input, Select } from "@/components/ui/primitives";
import { curriculumName, getPack } from "@/curriculum";
import { addDays } from "@/lib/calendar/logic";
import { getRepo, scoreText } from "@/lib/data/repo";
import { getRepo3, type Prefs } from "@/lib/data/repo3";
import { teacherFor, teacherPrompt } from "@/lib/teachers";
import { TeacherPicker } from "@/components/teachers/teacher-picker";
import type { Chat, ChatMessage, Citation, VaultFile } from "@/lib/data/types";
import { CARD_GROUPS, INTENT_CARDS, type FieldKey, type IntentCard } from "@/lib/hub/intent-cards";
import { cn } from "@/lib/utils";
import { utterance } from "@/lib/voice";
import { listNotebooks, matchNotes, numbered, type Notebook } from "@/lib/notes/store";
import { Markdown } from "./markdown";

interface Source {
  n: number;
  label: string;
  text: string;
  citation: Citation;
}

/* ---------- browser speech (free, on-device: section 1A) ---------- */

type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};

function getRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

function speak(text: string, locale: string, onEnd: () => void, voice = { pitch: 1, rate: 1 }) {
  const plain = text
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/\[\d+\]/g, "")
    .replace(/[#*_`>|]/g, "");
  const u = utterance(plain, /[؀-ۿ]/.test(plain) || locale === "ar" ? "ar" : "en", voice);
  u.onend = onEnd;
  u.onerror = onEnd;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ---------- the chat ---------- */

export function ChatTab() {
  const t = useTranslations("hub.chat");
  const cardsT = useTranslations("hub.cards");
  const locale = useLocale() as "en" | "ar";
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const repo = getRepo();

  const [chats, setChats] = useState<Chat[]>([]);
  const [active, setActive] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState("");
  // The student's notebooks, so the AI can read the ones they ask about.
  const notebooks = useRef<Notebook[] | null>(null);
  const pinnedNote = useRef<{ book: string; tab: string } | null>(null);
  const [justShowMe, setJustShowMe] = useState(false);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [card, setCard] = useState<IntentCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const urlCache = useRef(new Map<string, { title: string; text: string }>());
  const handledParams = useRef(false);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    repo.chats.list().then(setChats).catch(() => {});
    repo.files.list().then(setFiles).catch(() => {});
    getRepo3().prefs.get().then(setPrefs).catch(() => {});
  }, [repo]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, streaming]);

  async function openChat(c: Chat) {
    setActive(c);
    setShowHistory(false);
    setError(null);
    setMessages(await repo.messages.list(c.id));
  }

  function newChat() {
    setActive(null);
    setMessages([]);
    setError(null);
    setCard(null);
    setShowHistory(false);
  }

  /** Chats start by asking once for the student's own sources (section 6A.1). */
  async function ensureChat(firstText: string, patch: Partial<Chat> = {}): Promise<Chat> {
    if (active) {
      if (Object.keys(patch).length) {
        await repo.chats.update(active.id, patch);
        const next = { ...active, ...patch };
        setActive(next);
        return next;
      }
      return active;
    }
    const c = await repo.chats.create({ title: firstText.slice(0, 60) || t("newChat"), ...patch });
    setActive(c);
    setChats((l) => [c, ...l]);
    return c;
  }

  /** Finds the best excerpts: chosen sources first, then the whole vault. */
  async function gatherSources(chat: Chat, q: string, page?: number): Promise<Source[]> {
    const out: Source[] = [];
    const push = (label: string, text: string, citation: Omit<Citation, "n">) => {
      const n = out.length + 1;
      out.push({ n, label, text: text.slice(0, 3500), citation: { ...citation, n } });
    };
    // Their own notes: the tab they pinned ("Ask AI about this tab") or the ones their question names.
    notebooks.current ??= await listNotebooks().catch(() => []);
    const books = notebooks.current ?? [];
    const pinned = pinnedNote.current;
    const fromNotes = [
      ...(pinned ? books.flatMap((b) => (b.id === pinned.book ? b.tabs.filter((x) => x.id === pinned.tab).map((tab) => ({ book: b, tab })) : [])) : []),
      ...matchNotes(q, books),
    ].filter((x, i, a) => a.findIndex((y) => y.tab.id === x.tab.id) === i).slice(0, 2);
    for (const { book, tab } of fromNotes) {
      const label = `${locale === "ar" ? "ملاحظاتي" : "My notes"}: ${book.title} › ${tab.title}`;
      push(`${label} (lines numbered L1, L2…)`, numbered(tab.content), { file_id: null, file_name: label, page: null });
    }
    // A specific page ("Ask AI about this page").
    if (page && chat.source_file_ids[0]) {
      const fid = chat.source_file_ids[0];
      const p = (await repo.chunks.pages(fid)).find((x) => x.page === page);
      const name = files.find((f) => f.id === fid)?.name ?? "file";
      if (p) push(`${name}, page ${p.page}`, p.content, { file_id: fid, file_name: name, page: p.page });
    }
    // Student's links.
    for (const url of chat.source_urls) {
      let doc = urlCache.current.get(url);
      if (!doc) {
        const res = await fetch("/api/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        if (res.ok) {
          doc = (await res.json()) as { title: string; text: string };
          urlCache.current.set(url, doc);
        }
      }
      if (doc) {
        const parts = doc.text.match(/[\s\S]{1,2500}/g) ?? [];
        parts
          .map((p) => ({ p, s: scoreText(q, p) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 2)
          .forEach(({ p }) => push(`${doc!.title} (${url})`, p, { file_id: null, file_name: doc!.title, page: null, url }));
      }
    }
    // Files: chosen ones if any, otherwise everything.
    const hits = await repo.chunks.search(q, chat.source_file_ids.length ? chat.source_file_ids : undefined, 8 - out.length);
    for (const h of hits) {
      if (out.some((o) => o.citation.file_id === h.file_id && o.citation.page === h.page)) continue;
      push(`${h.file_name}, page ${h.page}`, h.content, { file_id: h.file_id, file_name: h.file_name, page: h.page });
    }
    return out;
  }

  async function send(text: string, opts: { patch?: Partial<Chat>; page?: number } = {}) {
    const content = text.trim();
    if (!content || streaming !== null) return;
    setError(null);
    setInput("");
    setCard(null);
    const chat = await ensureChat(content, { sources_answered: true, ...opts.patch });
    const userMsg = await repo.messages.create({ chat_id: chat.id, role: "user", content, citations: [] });
    const history = [...messages, userMsg];
    setMessages(history);
    setStreaming("");

    const sources = await gatherSources(chat, content, opts.page);
    const pack = getPack(profile.packId);
    const events = (await repo.events.list().catch(() => []))
      .filter((e) => !e.in_review && e.status !== "done" && new Date(e.starts_at) >= new Date() && new Date(e.starts_at) < addDays(new Date(), 21))
      .slice(0, 12)
      .map((e) => ({ title: e.title, type: e.type, date: e.starts_at.slice(0, 10) }));

    let res: Response;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          justShowMe,
          sources: sources.map(({ n, label, text }) => ({ n, label, text })),
          context: {
            name: profile.fullName,
            curriculum: curriculumName(pack?.id) ?? profile.curriculumCard,
            year: profile.year,
            subjects: profile.enrollments.map((e) => ({ name: e.name, level: e.level, target: e.targetGrade })),
            focusSubject: profile.enrollments.find((e) => e.subjectId === chat.subject_code)?.name,
            upcoming: events,
            today: new Date().toISOString().slice(0, 10),
            language: locale,
            teacher: teacherPrompt(teacherFor(prefs, chat.subject_code)),
          },
        }),
      });
    } catch {
      setStreaming(null);
      setError(t("error"));
      return;
    }

    if (!res.ok || !res.body) {
      setStreaming(null);
      const body = await res.json().catch(() => ({}));
      setError(res.status === 503 ? t("aiOff") : res.status === 429 ? t("limit") : (body as { message?: string }).message ?? t("error"));
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      full += dec.decode(value, { stream: true });
      setStreaming(full);
    }
    const used = new Set(Array.from(full.matchAll(/\[(\d{1,2})\](?!\()/g)).map((m) => Number(m[1])));
    const citations = sources.filter((s) => used.has(s.n)).map((s) => s.citation);
    const saved = await repo.messages.create({ chat_id: chat.id, role: "assistant", content: full, citations });
    setMessages((l) => [...l, saved]);
    setStreaming(null);
    setChats((l) => [{ ...chat, updated_at: new Date().toISOString() }, ...l.filter((c) => c.id !== chat.id)]);
  }

  // "Ask AI about this tab" from Notes: pin that tab and start the question for them.
  useEffect(() => {
    const book = params.get("notes");
    const tab = params.get("tab");
    if (!book || !tab || pinnedNote.current) return;
    pinnedNote.current = { book, tab };
    listNotebooks()
      .then((list) => {
        notebooks.current = list;
        const b = list.find((x) => x.id === book);
        const tb = b?.tabs.find((x) => x.id === tab);
        if (b && tb) setInput(locale === "ar" ? `في دفتري «${b.title} › ${tb.title}»: ` : `In my notes "${b.title} › ${tb.title}": `);
      })
      .catch(() => {});
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Ask AI about this page" from the file viewer.
  useEffect(() => {
    const fileId = params.get("file");
    const page = Number(params.get("page")) || undefined;
    if (!fileId || handledParams.current || !files.length) return;
    const f = files.find((x) => x.id === fileId);
    if (!f) return;
    handledParams.current = true;
    send(locale === "ar" ? `اشرح لي الصفحة ${page ?? 1} من «${f.name}».` : `Explain page ${page ?? 1} of "${f.name}" to me.`, {
      patch: { source_file_ids: [f.id], subject_code: f.subject_code },
      page,
    });
  }, [params, files]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleVoice() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) {
      setToast(t("voiceUnsupported"));
      return;
    }
    rec.lang = locale === "ar" ? "ar-SA" : "en-US";
    rec.interimResults = true;
    const base = input ? input + " " : "";
    rec.onresult = (e) => setInput(base + Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const showStart = !active && messages.length === 0;
  const cards = INTENT_CARDS.filter((c) => !c.only || c.only === profile.packId || (c.only === "ib-dp" && profile.packId === "ib-cp"));

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* History */}
      <aside className={cn("min-w-0 flex-col gap-2", showHistory ? "flex" : "hidden lg:flex")}>
        <Button onClick={newChat} variant="outline" className="justify-start">
          <MessageSquarePlus aria-hidden />
          {t("newChat")}
        </Button>
        <h2 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("history")}</h2>
        {chats.length === 0 && <p className="px-1 text-sm text-muted">{t("emptyHistory")}</p>}
        <ul className="flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto">
          {chats.map((c) => (
            <li key={c.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => openChat(c)}
                className={cn("min-w-0 flex-1 truncate rounded-[8px] px-2 py-2 text-start text-sm", active?.id === c.id ? "bg-primary-soft text-primary" : "hover:bg-surface-2")}
              >
                {c.title}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await repo.chats.remove(c.id);
                  setChats((l) => l.filter((x) => x.id !== c.id));
                  if (active?.id === c.id) newChat();
                }}
                className="p-1.5 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100"
                aria-label={t("deleteChat")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
            {t("history")}
          </Button>
          {!showStart && (
            <Button variant="ghost" size="sm" onClick={newChat}>
              <MessageSquarePlus aria-hidden />
              {t("newChat")}
            </Button>
          )}
        </div>

        {showStart && !card && (
          <>
            <SourcesPrompt files={files} onDone={(patch) => ensureChat(t("newChat"), patch)} />
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t("cardsTitle")}</h2>
              {CARD_GROUPS.map((g) => {
                const list = cards.filter((c) => c.group === g);
                if (!list.length) return null;
                return (
                  <section key={g} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{cardsT(`groups.${g}`)}</h3>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                      {list.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setCard(c)}
                            className="flex h-full min-h-14 w-full items-center rounded-[var(--radius-card)] border border-border bg-surface p-3 text-start text-sm font-medium transition-[box-shadow,border-color] hover:border-primary/50 hover:shadow-md"
                          >
                            {c.title[locale]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}

        {card && <CardForm card={card} files={files} onCancel={() => setCard(null)} onStart={(prompt, patch) => send(prompt, { patch })} />}

        {(messages.length > 0 || streaming !== null) && (
          <ol className="flex flex-col gap-4" aria-live="polite">
            {active && (active.source_file_ids.length > 0 || active.source_urls.length > 0) && (
              <li className="text-xs text-muted">
                <BookOpen className="me-1 inline size-3.5" aria-hidden />
                {t("sourcesUsing", { count: active.source_file_ids.length + active.source_urls.length })}
              </li>
            )}
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                m={m}
                speaking={speakingId === m.id}
                onSpeak={() => {
                  if (speakingId === m.id) {
                    speechSynthesis.cancel();
                    setSpeakingId(null);
                  } else {
                    setSpeakingId(m.id);
                    speak(m.content, locale, () => setSpeakingId(null), teacherFor(prefs, active?.subject_code).voice);
                  }
                }}
                onQuiz={() => send(t("quizPrompt"))}
                onFlashcards={async () => {
                  // Turn this answer into a real flashcard deck (section 6.2 hand-off).
                  const res = await fetch("/api/cards", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: m.content, count: 8, language: locale }),
                  });
                  const data = (await res.json().catch(() => ({}))) as { cards?: { front: string; back: string }[]; message?: string };
                  if (!data.cards?.length) {
                    setToast(data.message ?? t("error"));
                    return;
                  }
                  const repo3 = getRepo3();
                  const deck = await repo3.decks.create({ name: (active?.title ?? t("newChat")).slice(0, 120), subject_code: active?.subject_code ?? null, source_file_id: null });
                  await repo3.cards.createMany(data.cards.map((c) => ({ deck_id: deck.id, ...c })));
                  setToast(t("deckMade", { count: data.cards.length }));
                }}
                onCalendar={async () => {
                  const d = addDays(new Date(), 1);
                  d.setHours(8, 0, 0, 0);
                  await repo.events.create({
                    title: `Review: ${active?.title ?? "chat"}`.slice(0, 200),
                    type: "personal",
                    subject_code: active?.subject_code ?? null,
                    starts_at: d.toISOString(),
                    ends_at: null,
                    all_day: true,
                    description: m.content.slice(0, 1000),
                    location: null,
                    dress_code: null,
                    estimated_minutes: 20,
                    source: "ai",
                    confidence: null,
                    status: "todo",
                    in_review: false,
                    reminders: [0],
                    parent_id: null,
                    repeat_every_days: null,
                    repeat_until: null,
                    linked_file_ids: m.citations.map((c) => c.file_id).filter((x): x is string => !!x),
                  });
                  setToast(t("taskAdded"));
                }}
              />
            ))}
            {streaming !== null && (
              <li className="flex flex-col gap-1">
                <Card className="p-4">{streaming ? <Markdown content={streaming} citations={[]} /> : <p className="animate-pulse text-sm text-muted">{t("thinking")}</p>}</Card>
              </li>
            )}
          </ol>
        )}

        {error && (
          <p role="alert" className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div ref={endRef} />

        {/* Composer */}
        <form
          className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-2 shadow-sm md:bottom-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            dir="auto"
            className="w-full resize-none bg-transparent px-2 py-1 text-base outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-2">
            <TeacherPicker
              prefs={prefs}
              subjectCode={active?.subject_code}
              subjectName={profile.enrollments.find((e) => e.subjectId === active?.subject_code)?.name}
              onChange={(p) => {
                setPrefs(p);
                getRepo3().prefs.set(p).catch(() => {});
              }}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted" title={t("justShowMeHint")}>
              <input id="just-show-me" type="checkbox" className="size-4 accent-[var(--primary)]" checked={justShowMe} onChange={(e) => setJustShowMe(e.target.checked)} />
              {t("justShowMe")}
            </label>
            <Button type="button" variant="ghost" size="icon" className={cn("ms-auto", listening && "text-danger")} onClick={toggleVoice} aria-label={t("voice")} aria-pressed={listening}>
              {listening ? <Square /> : <Mic />}
            </Button>
            <Button type="submit" disabled={!input.trim() || streaming !== null}>
              <Send className="rtl:-scale-x-100" aria-hidden />
              {t("send")}
            </Button>
          </div>
        </form>
      </section>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

/* ---------- pieces ---------- */

function MessageItem({
  m,
  speaking,
  onSpeak,
  onQuiz,
  onFlashcards,
  onCalendar,
}: {
  m: ChatMessage;
  speaking: boolean;
  onSpeak: () => void;
  onQuiz: () => void;
  onFlashcards: () => void;
  onCalendar: () => void;
}) {
  const t = useTranslations("hub.chat");
  const [copied, setCopied] = useState(false);
  if (m.role === "user") {
    return (
      <li className="flex justify-end">
        <p dir="auto" className="max-w-[85%] whitespace-pre-wrap rounded-[16px] rounded-ee-[4px] bg-primary px-4 py-2.5 text-[15px] text-on-primary">
          {m.content}
        </p>
      </li>
    );
  }
  const action = "inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text";
  return (
    <li className="flex flex-col gap-1.5">
      <Card className="p-4">
        <Markdown content={m.content} citations={m.citations} />
        {m.citations.length > 0 && (
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-xs font-semibold text-muted">{t("sourcesUsed")}</p>
            <ul className="flex flex-col gap-0.5">
              {m.citations.map((c) => (
                <li key={c.n} className="text-xs">
                  <Link
                    href={c.url ?? `/hub/file/${c.file_id}${c.page ? `?page=${c.page}` : ""}`}
                    target={c.url ? "_blank" : undefined}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <span className="font-semibold">[{c.n}]</span>
                    {c.url ? <Link2 className="size-3" aria-hidden /> : <FileText className="size-3" aria-hidden />}
                    {c.file_name}
                    {c.page && `, p. ${c.page}`}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <div className="flex flex-wrap gap-0.5">
        <button type="button" className={action} onClick={onSpeak}>
          {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {speaking ? t("stop") : t("listen")}
        </button>
        <button
          type="button"
          className={action}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(m.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t("copied") : t("copy")}
        </button>
        <Link href={`/whiteboard?topic=${encodeURIComponent(m.content.slice(0, 200))}`} className={action}>
          <PenTool className="size-3.5" />
          {t("visual")}
        </Link>
        <button type="button" className={action} onClick={onFlashcards}>
          <Layers className="size-3.5" />
          {t("flashcards")}
        </button>
        <button type="button" className={action} onClick={onQuiz}>
          <BookOpen className="size-3.5" />
          {t("quiz")}
        </button>
        <button type="button" className={action} onClick={onCalendar}>
          <CalendarPlus className="size-3.5" />
          {t("toCalendar")}
        </button>
      </div>
    </li>
  );
}

/** "Do you have any sources you want me to use?" (section 6A.1) */
function SourcesPrompt({ files, onDone }: { files: VaultFile[]; onDone: (patch: Partial<Chat>) => void }) {
  const t = useTranslations("hub.chat");
  const [mode, setMode] = useState<"ask" | "files" | "link" | "done">("ask");
  const [picked, setPicked] = useState<string[]>([]);
  const [link, setLink] = useState("");
  if (mode === "done") return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold">{t("sourcesTitle")}</p>
        <p className="text-sm text-muted">{t("sourcesText")}</p>
      </div>
      {mode === "ask" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMode("files")} disabled={!files.length}>
            <FileText aria-hidden />
            {t("pickFiles")}
          </Button>
          <UploadFromDevice variant="secondary" onReady={(f) => onDone({ source_file_ids: [f.id], sources_answered: true })} />
          <Button variant="secondary" size="sm" onClick={() => setMode("link")}>
            <Link2 aria-hidden />
            {t("addLink")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("done")}>
            {t("skip")}
          </Button>
        </div>
      )}
      {mode === "files" && (
        <div className="flex flex-col gap-2">
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {files.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={picked.includes(f.id)} onChange={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))} />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
          <Button
            size="sm"
            className="self-start"
            disabled={!picked.length}
            onClick={() => {
              onDone({ source_file_ids: picked, sources_answered: true });
              setMode("done");
            }}
          >
            {t("useSources")}
          </Button>
        </div>
      )}
      {mode === "link" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^https?:\/\//.test(link)) return;
            onDone({ source_urls: [link], sources_answered: true });
            setMode("done");
          }}
        >
          <Input type="url" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t("linkPlaceholder")} aria-label={t("addLink")} />
          <Button type="submit">{t("useSources")}</Button>
        </form>
      )}
    </Card>
  );
}

/** Guided form for an intent card: a few short fields, then the AI starts. */
function CardForm({ card, files, onCancel, onStart }: { card: IntentCard; files: VaultFile[]; onCancel: () => void; onStart: (prompt: string, patch: Partial<Chat>) => void }) {
  const t = useTranslations("hub.chat");
  const f = useTranslations("hub.cards.fields");
  const locale = useLocale() as "en" | "ar";
  const profile = useCurrentProfile();
  const [v, setV] = useState<Record<string, string>>({});
  const set = (k: FieldKey, val: string) => setV((x) => ({ ...x, [k]: val }));
  const multiline: FieldKey[] = ["text", "task", "grade"];
  const fileId = useMemo(() => files.find((x) => x.name === v.file)?.id, [files, v.file]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="rounded p-1 text-muted hover:text-text" aria-label={t("back")}>
          <ArrowLeft className="size-4 rtl:rotate-180" />
        </button>
        <h2 className="text-lg font-semibold">{card.title[locale]}</h2>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const subj = profile.enrollments.find((x) => x.name === v.subject);
          onStart(card.prompt(v as Record<FieldKey, string>), {
            subject_code: subj?.subjectId ?? null,
            ...(fileId ? { source_file_ids: [fileId] } : {}),
          });
        }}
      >
        {card.fields.map((k) => (
          <div key={k} className="flex flex-col gap-1.5">
            <label htmlFor={`card-${k}`} className="text-sm font-medium">
              {f(k)}
            </label>
            {k === "subject" ? (
              <Select id={`card-${k}`} value={v.subject ?? ""} onChange={(e) => set(k, e.target.value)}>
                <option value="">{f("anySubject")}</option>
                {profile.enrollments.map((s) => (
                  <option key={s.subjectId} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : k === "file" ? (
              <Select id={`card-${k}`} value={v.file ?? ""} onChange={(e) => set(k, e.target.value)}>
                <option value="">—</option>
                {files.map((x) => (
                  <option key={x.id} value={x.name}>
                    {x.name}
                  </option>
                ))}
              </Select>
            ) : k === "style" ? (
              <Select id={`card-${k}`} value={v.style ?? "MLA"} onChange={(e) => set(k, e.target.value)}>
                {["MLA", "APA", "Chicago"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
            ) : multiline.includes(k) ? (
              <textarea
                id={`card-${k}`}
                rows={5}
                dir="auto"
                value={v[k] ?? ""}
                onChange={(e) => set(k, e.target.value)}
                className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            ) : (
              <Input id={`card-${k}`} type={k === "date" ? "date" : k === "count" ? "number" : "text"} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} dir="auto" />
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="submit">{t("start")}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("back")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
