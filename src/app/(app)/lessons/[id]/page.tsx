"use client";

import { ArrowLeft, BookOpen, FileText, Layers, ListChecks, Loader2, MessageSquare, PenTool, RotateCcw, Send, Trash2, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { JobProgress } from "@/components/lessons/progress";
import { ReviewItem } from "@/components/school/review-item";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Input } from "@/components/ui/primitives";
import { useEvents } from "@/lib/calendar/use-events";
import { intlLocale } from "@/lib/calendar/style";
import { scoreText } from "@/lib/data/repo";
import { getRepo3 } from "@/lib/data/repo3";
import { getBlob } from "@/lib/data/idb";
import { uploadAndProcess, ensureDefaultFolders } from "@/lib/hub/process";
import { getRepo5 } from "@/lib/lessons/repo";
import { isRunning, lessonNotes, runLesson, useLessonJobs } from "@/lib/lessons/runner";
import { mediaKey, slideKey, type Lesson } from "@/lib/lessons/types";
import { clock } from "@/lib/school/dates";
import { similarity } from "@/lib/school/match";
import { cn, subjectColor } from "@/lib/utils";
import type { QuizQuestion } from "@/prompts/lesson.v1";
import { recordStudy } from "@/lib/progress/study";
import { saveAttempt } from "@/lib/progress/stats";
import { awardXp } from "@/lib/progress/xp";

type Tab = "transcript" | "summary" | "chat" | "quiz";

/* ---------------- quiz ---------------- */

function Quiz({ questions, onSeek, subjectCode, unit }: { questions: QuizQuestion[]; onSeek: (s: number) => void; subjectCode: string | null; unit: string }) {
  const t = useTranslations("lessons.quiz");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const score = questions.filter((q, i) => picked[i] === q.answer).length;
  const answered = Object.keys(picked).length;
  const recorded = useRef(false);
  useEffect(() => {
    if (answered !== questions.length || recorded.current) return;
    recorded.current = true;
    void recordStudy({ questions: questions.length, correct: score });
    void saveAttempt({ kind: "lesson", subject_code: subjectCode, unit: unit, score, total: questions.length, data: {} });
    void awardXp("quiz", score * 3, `quiz:${Date.now()}`);
  }, [answered, questions.length, score, subjectCode, unit]);
  return (
    <div className="flex flex-col gap-4">
      {questions.map((q, i) => (
        <fieldset key={i} className="rounded-[12px] border border-border p-3">
          <legend className="px-1 text-sm font-medium" dir="auto">
            {i + 1}. {q.q}
          </legend>
          <div className="mt-1 flex flex-col gap-1.5">
            {q.options.map((o, j) => {
              const chosen = picked[i] === j;
              const done = picked[i] !== undefined;
              return (
                <button
                  key={j}
                  type="button"
                  disabled={done}
                  onClick={() => setPicked((p) => ({ ...p, [i]: j }))}
                  dir="auto"
                  className={cn(
                    "rounded-[10px] border px-3 py-2 text-start text-sm",
                    !done && "border-border hover:border-primary",
                    done && j === q.answer && "border-success bg-success/10",
                    done && chosen && j !== q.answer && "border-danger bg-danger/10",
                    done && !chosen && j !== q.answer && "border-border opacity-60",
                  )}
                >
                  {o}
                </button>
              );
            })}
          </div>
          {picked[i] !== undefined && (
            <p className="mt-2 text-sm text-muted" dir="auto">
              {q.why}{" "}
              {q.at && (
                <button type="button" className="font-medium text-primary underline" onClick={() => onSeek(q.at.split(":").map(Number).reduce((a, n) => a * 60 + n, 0))}>
                  {t("taughtAt", { time: q.at })}
                </button>
              )}
            </p>
          )}
        </fieldset>
      ))}
      {answered === questions.length && (
        <p className="text-lg font-semibold" role="status">
          {t("score", { score, total: questions.length })}
        </p>
      )}
    </div>
  );
}

/* ---------------- chat with the lesson ---------------- */

function LessonChat({ lesson, onSeek }: { lesson: Lesson; onSeek: (s: number) => void }) {
  const t = useTranslations("lessons.chat");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // ~90-second passages of the transcript, to pick the ones that match the question.
  const passages = useMemo(() => {
    const out: { at: number; text: string }[] = [];
    let cur: string[] = [];
    let start = 0;
    for (const l of lesson.transcript) {
      if (!cur.length) start = l.s;
      cur.push(`[${clock(l.s)}] ${l.text}`);
      if (l.e - start > 90) {
        out.push({ at: start, text: cur.join("\n") });
        cur = [];
      }
    }
    if (cur.length) out.push({ at: start, text: cur.join("\n") });
    return out;
  }, [lesson.transcript]);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: question.trim() }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setQ("");
    setBusy(true);
    const ranked = passages
      .map((p) => ({ ...p, score: scoreText(question, p.text) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .sort((a, b) => a.at - b.at);
    // Always include every task found, with its time, so "what's the homework?" gets all of them.
    const tasks = lesson.items.length
      ? `Tasks the teacher set in this lesson:\n${lesson.items.map((i) => `[${clock(i.at)}] ${i.kind}: "${i.quote}"${i.due ? ` (due ${i.due.slice(0, 10)})` : ""}`).join("\n")}`
      : "";
    const excerpts = [tasks, lesson.summary ? `Summary of the whole lesson:\n${lesson.summary}` : "", ...ranked.map((p) => p.text)].filter(Boolean).join("\n\n");
    try {
      const res = await fetch("/api/lessons/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: lesson.title, messages: history, excerpts }) });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? t("failed"));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: text }]);
      }
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : t("failed")}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {[t("s1"), t("s2"), t("s3")].map((s) => (
            <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-primary" dir="auto">
              {s}
            </button>
          ))}
        </div>
      )}
      {messages.map((m, i) =>
        m.role === "user" ? (
          <p key={i} className="self-end rounded-[12px] bg-primary-soft px-3 py-2 text-sm" dir="auto">
            {m.content}
          </p>
        ) : (
          <div key={i} className="rounded-[12px] border border-border bg-surface px-3 py-2">
            {m.content ? <Markdown content={m.content} citations={[]} onSeek={onSeek} /> : <Loader2 className="size-4 animate-spin text-muted" />}
          </div>
        ),
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeholder")} dir="auto" aria-label={t("placeholder")} />
        <Button type="submit" disabled={busy || !q.trim()} aria-label={t("send")}>
          <Send aria-hidden />
        </Button>
      </form>
    </div>
  );
}

/* ---------------- the page ---------------- */

function LessonPage() {
  const t = useTranslations("lessons");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const profile = useCurrentProfile();
  const jobs = useLessonJobs();
  const job = jobs.find((j) => j.lessonId === id);
  const { events, reload: reloadEvents } = useEvents();
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [hasMedia, setHasMedia] = useState<boolean | null>(null);
  const [slideUrls, setSlideUrls] = useState<Record<number, string>>({});
  const [now, setNow] = useState(0);
  const [tab, setTab] = useState<Tab>("transcript");
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const lines = useRef<HTMLDivElement>(null);

  const load = useCallback(() => getRepo5().lessons.get(id).then(setLesson).catch(() => setLesson(null)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  // Reload when the analyzer moves to a new stage.
  useEffect(() => {
    if (!job) return;
    load().then(() => {
      if (job.stage === "done") reloadEvents();
    });
  }, [job?.stage, load, reloadEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  // The recording lives on the device it was added from.
  useEffect(() => {
    let url: string | null = null;
    getBlob(mediaKey(id))
      .then((b) => {
        setHasMedia(Boolean(b));
        if (b) setMediaUrl((url = URL.createObjectURL(b)));
      })
      .catch(() => setHasMedia(false));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  useEffect(() => {
    if (!lesson?.slides.length) return;
    const urls: Record<number, string> = {};
    Promise.all(lesson.slides.map((_, n) => getBlob(slideKey(id, n)).then((b) => b && (urls[n] = URL.createObjectURL(b))))).then(() => setSlideUrls({ ...urls }));
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  }, [id, lesson?.slides]);

  const seek = useCallback(
    (s: number) => {
      setTab("transcript");
      setNow(s);
      setFollow(true);
      const p = player.current;
      if (p) {
        p.currentTime = s;
        p.play().catch(() => {});
        p.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    },
    [],
  );

  // ?t=2052 from a calendar item's "Heard at 34:12" link.
  const startAt = Number(params.get("t"));
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !lesson?.transcript.length || !Number.isFinite(startAt) || !params.get("t")) return;
    jumped.current = true;
    setNow(startAt);
    if (player.current) player.current.currentTime = startAt;
  }, [lesson?.transcript.length, startAt, params, mediaUrl]);

  // Keep the current line in view while playing.
  const current = useMemo(() => {
    if (!lesson) return -1;
    let idx = -1;
    for (let i = 0; i < lesson.transcript.length; i++) if (lesson.transcript[i].s <= now + 0.2) idx = i;
    return idx;
  }, [lesson, now]);
  useEffect(() => {
    if (!follow || current < 0 || tab !== "transcript") return;
    const el = lines.current?.querySelector<HTMLElement>(`[data-i="${current}"]`);
    const box = lines.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 3, behavior: "smooth" });
  }, [current, follow, tab]);

  if (lesson === undefined) return <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />;
  if (lesson === null)
    return <EmptyState title={t("notFound")} text={t("notFoundText")} />;

  const subject = profile.enrollments.find((e) => e.subjectId === lesson.subject_code);
  const running = isRunning(lesson.id);
  const itemEvents = lesson.items.map((it) => ({ it, ev: events.find((e) => e.id === it.event_id) }));
  const stopped = lesson.status === "processing" && !running;
  // Teams Level 3 imports class transcripts in the background; the analysis runs here.
  const fromTeams = stopped && lesson.media_name === "Teams transcript" && !lesson.items.length;
  const notes = lessonNotes(lesson);

  const retry = () =>
    runLesson({ lesson, enrollments: profile.enrollments, readSlides: lesson.media_kind === "video" && !lesson.slides.length });

  const makeCards = async () => {
    setBusy("cards");
    setNotice("");
    try {
      const res = await fetch("/api/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: notes, count: 12, subject: subject?.name }) });
      const data = (await res.json()) as { cards?: { front: string; back: string }[]; message?: string };
      if (!res.ok || !data.cards?.length) throw new Error(data.message ?? t("outputs.failed"));
      const repo3 = getRepo3();
      const deck = await repo3.decks.create({ name: lesson.title.slice(0, 120), subject_code: lesson.subject_code, source_file_id: null });
      await repo3.cards.createMany(data.cards.map((c) => ({ deck_id: deck.id, front: c.front, back: c.back })));
      setNotice(t("outputs.cardsDone", { count: data.cards.length }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("outputs.failed"));
    } finally {
      setBusy(null);
    }
  };

  const makeQuiz = async () => {
    setBusy("quiz");
    setNotice("");
    try {
      const res = await fetch("/api/lessons/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes, count: 10 }) });
      const data = (await res.json()) as { questions?: QuizQuestion[]; message?: string };
      if (!res.ok || !data.questions?.length) throw new Error(data.message ?? t("outputs.failed"));
      setQuiz(data.questions);
      setTab("quiz");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("outputs.failed"));
    } finally {
      setBusy(null);
    }
  };

  const makeMissed = async () => {
    setBusy("missed");
    setNotice("");
    try {
      const res = await fetch("/api/lessons/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "missed", title: lesson.title, subject: subject?.name, lessonDate: lesson.lesson_date, notes }),
      });
      const data = (await res.json()) as { text?: string; message?: string };
      if (!res.ok || !data.text) throw new Error(data.message ?? t("outputs.failed"));
      await getRepo5().lessons.update(lesson.id, { missed: data.text });
      setLesson({ ...lesson, missed: data.text });
      setTab("summary");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("outputs.failed"));
    } finally {
      setBusy(null);
    }
  };

  // Notes go into the unit folder that best matches what the lesson covered (section 11.3).
  const saveNotes = async () => {
    setBusy("notes");
    setNotice("");
    try {
      const folders = await ensureDefaultFolders(profile);
      const mine = folders.filter((f) => f.subject_code === lesson.subject_code);
      const about = `${lesson.title} ${lesson.chapters.map((c) => c.title).join(" ")}`;
      const unit = mine
        .filter((f) => f.parent_id)
        .map((f) => ({ f, score: similarity(f.name, about) }))
        .sort((a, b) => b.score - a.score)[0];
      const folder = unit && unit.score > 0.05 ? unit.f : mine.find((f) => !f.parent_id) ?? null;
      const md = `# ${lesson.title}\n\n${lesson.lesson_date}\n\n${lesson.summary ?? ""}\n\n${lesson.chapters.length ? `## Chapters\n${lesson.chapters.map((c) => `- ${clock(c.at)} ${c.title}`).join("\n")}\n` : ""}`;
      const file = new File([md], `${lesson.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80)}.md`, { type: "text/markdown" });
      await uploadAndProcess(file, folder?.id ?? null, profile, () => {});
      setNotice(t("outputs.notesDone", { folder: folder?.name ?? t("outputs.vault") }));
    } catch {
      setNotice(t("outputs.failed"));
    } finally {
      setBusy(null);
    }
  };

  // The whiteboard gets only the topic name (public), never the student's lesson.
  const recapTopic =
    lesson.chapters.find((c) => lesson.key_points.some((k) => k.kind === "stressed" && k.at >= c.at))?.title ??
    [...lesson.chapters].sort((a, b) => b.title.length - a.title.length)[0]?.title ??
    lesson.title;

  const slidesAt = new Map<number, number[]>();
  lesson.slides.forEach((s, n) => {
    const idx = lesson.transcript.findIndex((l) => l.s >= s.at);
    const key = idx < 0 ? lesson.transcript.length - 1 : idx;
    slidesAt.set(key, [...(slidesAt.get(key) ?? []), n]);
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/lessons" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t("title")}
          </Link>
          <h1 className="text-2xl font-bold sm:text-[28px]" dir="auto">
            {lesson.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {subject && <Chip color={subjectColor(subject.color)}>{subject.name}</Chip>}
            <span>{new Date(`${lesson.lesson_date}T12:00:00`).toLocaleDateString(intlLocale(locale), { weekday: "long", day: "numeric", month: "long" })}</span>
            {lesson.duration_s ? <span>· {clock(lesson.duration_s)}</span> : null}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm(t("deleteConfirm"))) return;
            await getRepo5().lessons.remove(lesson.id);
            router.push("/lessons");
          }}
        >
          <Trash2 aria-hidden />
          {t("delete")}
        </Button>
      </div>

      {(running || stopped || lesson.status === "error") && (
        <Card className="flex flex-col gap-3 p-4">
          {running && job ? <JobProgress job={job} /> : <p className={cn("text-sm", lesson.status === "error" ? "text-danger" : "text-muted")}>{lesson.status === "error" ? lesson.error : fromTeams ? t("fromTeams") : t("stopped")}</p>}
          {running && <p className="text-sm text-muted">{t("keepOpen")}</p>}
          {!running && (hasMedia || lesson.transcript.length > 0) && (
            <Button variant="outline" className="self-start" onClick={retry}>
              <RotateCcw aria-hidden />
              {fromTeams ? t("analyzeNow") : t("retry")}
            </Button>
          )}
        </Card>
      )}

      {/* Action items at the top (section 11.3). */}
      {lesson.status === "ready" && (
        <section className="flex flex-col gap-2" aria-labelledby="items-h">
          <h2 id="items-h" className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="size-5 text-primary" aria-hidden /> {t("items.title")}
          </h2>
          {lesson.items.length === 0 ? (
            <p className="text-sm text-muted">{t("items.none")}</p>
          ) : (
            <div className="grid items-start gap-2 lg:grid-cols-2">
              {itemEvents.map(({ it, ev }) =>
                ev ? (
                  <ReviewItem key={it.id} event={ev} all={events} enrollments={profile.enrollments} onSeek={seek} onChanged={reloadEvents} />
                ) : (
                  <div key={it.id} className="rounded-[12px] border border-dashed border-border p-3 text-sm text-muted">
                    <span className="line-through" dir="auto">
                      {it.title}
                    </span>{" "}
                    · {t("items.dismissed")}{" "}
                    <button type="button" className="text-primary underline" onClick={() => seek(it.at)}>
                      {clock(it.at)}
                    </button>
                  </div>
                ),
              )}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Player + chapters */}
        <div className="flex flex-col gap-3">
          {mediaUrl ? (
            lesson.media_kind === "video" ? (
              <video ref={player} src={mediaUrl} controls playsInline className="aspect-video w-full rounded-[var(--radius-card)] bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
            ) : (
              <audio ref={player} src={mediaUrl} controls className="w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
            )
          ) : hasMedia === false && lesson.media_kind !== "transcript" ? (
            <p className="rounded-[12px] bg-surface-2 p-3 text-sm text-muted">{t("noMedia")}</p>
          ) : null}

          {lesson.chapters.length > 0 && (
            <Card className="p-3">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t("chapters")}</h2>
              <ol className="flex flex-col">
                {lesson.chapters.map((c, i) => {
                  const active = now >= c.at && (lesson.chapters[i + 1]?.at ?? Infinity) > now;
                  return (
                    <li key={i}>
                      <button type="button" onClick={() => seek(c.at)} className={cn("flex w-full gap-3 rounded-[8px] px-2 py-1.5 text-start text-sm hover:bg-surface-2", active && "bg-primary-soft text-primary")}>
                        <span className="w-14 shrink-0 font-mono text-muted">{clock(c.at)}</span>
                        <span dir="auto">{c.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {lesson.status === "ready" && (
            <Card className="flex flex-col gap-3 p-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{t("outputs.title")}</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={makeCards} disabled={busy !== null}>
                  {busy === "cards" ? <Loader2 className="animate-spin" /> : <Layers aria-hidden />}
                  {t("outputs.cards")}
                </Button>
                <Button variant="outline" onClick={makeQuiz} disabled={busy !== null}>
                  {busy === "quiz" ? <Loader2 className="animate-spin" /> : <ListChecks aria-hidden />}
                  {t("outputs.quiz")}
                </Button>
                <Button variant="outline" asChild>
                  <Link href={`/whiteboard?topic=${encodeURIComponent(recapTopic)}`}>
                    <PenTool aria-hidden />
                    {t("outputs.whiteboard")}
                  </Link>
                </Button>
                <Button variant="outline" onClick={saveNotes} disabled={busy !== null}>
                  {busy === "notes" ? <Loader2 className="animate-spin" /> : <FileText aria-hidden />}
                  {t("outputs.notes")}
                </Button>
                <Button variant="outline" onClick={makeMissed} disabled={busy !== null} className="col-span-2">
                  {busy === "missed" ? <Loader2 className="animate-spin" /> : <UserX aria-hidden />}
                  {t("outputs.missed")}
                </Button>
              </div>
              {notice && (
                <p className="text-sm text-muted" role="status">
                  {notice}
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Transcript / summary / chat / quiz */}
        <Card className="flex min-h-0 flex-col p-0">
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border p-2">
            {(
              [
                ["transcript", BookOpen],
                ["summary", FileText],
                ["chat", MessageSquare],
                ["quiz", ListChecks],
              ] as const
            ).map(([k, Icon]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                disabled={(k === "quiz" && !quiz) || (k !== "transcript" && lesson.status !== "ready")}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium disabled:opacity-40", tab === k ? "bg-primary-soft text-primary" : "text-muted hover:text-text")}
              >
                <Icon className="size-4" aria-hidden />
                {t(`tabs.${k}`)}
              </button>
            ))}
          </div>

          {tab === "transcript" && (
            <div ref={lines} className="relative max-h-[60dvh] overflow-y-auto p-2" onWheel={() => setFollow(false)} onTouchMove={() => setFollow(false)}>
              {lesson.transcript.length === 0 ? (
                <p className="p-3 text-sm text-muted">{t("noTranscript")}</p>
              ) : (
                lesson.transcript.map((l, i) => (
                  <div key={i} data-i={i}>
                    <button
                      type="button"
                      onClick={() => seek(l.s)}
                      className={cn("flex w-full gap-3 rounded-[8px] px-2 py-1 text-start text-[15px] leading-6 hover:bg-surface-2", i === current && "bg-primary-soft")}
                    >
                      <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">{clock(l.s)}</span>
                      <span dir="auto">
                        {l.speaker && <span className="font-semibold">{l.speaker}: </span>}
                        {l.text}
                      </span>
                    </button>
                    {(slidesAt.get(i) ?? []).map((n) => (
                      <figure key={n} className="my-2 ms-16 overflow-hidden rounded-[10px] border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing to optimize */}
                        {slideUrls[n] && <img src={slideUrls[n]} alt={t("slideAlt", { time: clock(lesson.slides[n].at) })} className="w-full" />}
                        <figcaption className="whitespace-pre-line bg-surface-2 p-2 text-xs text-muted" dir="auto">
                          {lesson.slides[n].text}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ))
              )}
              {!follow && (
                <button type="button" onClick={() => setFollow(true)} className="sticky bottom-2 start-full rounded-full bg-primary px-3 py-1 text-xs font-medium text-on-primary shadow-md">
                  {t("follow")}
                </button>
              )}
            </div>
          )}
          {tab === "summary" && (
            <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto p-4">
              {lesson.missed && (
                <div className="rounded-[12px] bg-primary-soft/60 p-3">
                  <Markdown content={lesson.missed} citations={[]} onSeek={seek} />
                </div>
              )}
              {lesson.summary ? <Markdown content={lesson.summary} citations={[]} onSeek={seek} /> : <p className="text-sm text-muted">{t("noSummary")}</p>}
              {lesson.key_points.length > 0 && (
                <div>
                  <h3 className="mb-1 font-semibold">{t("keyPoints")}</h3>
                  <ul className="flex flex-col gap-1 text-sm">
                    {lesson.key_points.map((k, i) => (
                      <li key={i} className="flex gap-2" dir="auto">
                        <button type="button" className="shrink-0 font-mono text-xs text-primary" onClick={() => seek(k.at)}>
                          {clock(k.at)}
                        </button>
                        <span>
                          {k.kind === "stressed" && <span className="me-1 rounded bg-warning/15 px-1 text-xs font-medium text-warning">{t("stressed")}</span>}
                          {k.kind === "question" && <span className="me-1 rounded bg-surface-2 px-1 text-xs font-medium">{t("question")}</span>}
                          {k.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {tab === "chat" && (
            <div className="max-h-[70dvh] overflow-y-auto p-4">
              <LessonChat lesson={lesson} onSeek={seek} />
            </div>
          )}
          {tab === "quiz" && quiz && (
            <div className="max-h-[70dvh] overflow-y-auto p-4">
              <Quiz questions={quiz} onSeek={seek} subjectCode={lesson.subject_code} unit={lesson.title} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LessonPage />
    </Suspense>
  );
}
