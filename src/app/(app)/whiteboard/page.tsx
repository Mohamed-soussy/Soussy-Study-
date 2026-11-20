"use client";

import { Loader2, MessageCircleQuestion, PenTool, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { curriculumName, getPack } from "@/curriculum";
import { lessonKey, type Lesson } from "@/lib/whiteboard/types";
import type { PickedShape } from "@/components/whiteboard/player";
import { TeacherPicker } from "@/components/teachers/teacher-picker";
import { playsAudioHere } from "@/components/devices/device-sync";
import { getRepo3, type Prefs } from "@/lib/data/repo3";
import { teacherFor, teacherPrompt } from "@/lib/teachers";

// Konva needs the browser canvas, so the player loads on the client only.
const WhiteboardPlayer = dynamic(() => import("@/components/whiteboard/player").then((m) => m.WhiteboardPlayer), { ssr: false });

const RECENT_KEY = "soussy.whiteboard.recent";
interface Recent {
  key: string;
  topic: string;
  lesson: Lesson;
}

function loadRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}
function saveRecent(list: Recent[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* storage full or blocked */
  }
}

function speak(text: string, lang: "en" | "ar", voice = { pitch: 1, rate: 1 }) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ar" ? "ar-SA" : "en-US";
  const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.pitch = voice.pitch;
  u.rate = voice.rate;
  synth.speak(u);
}

/** AI Whiteboard (section 7): the signature feature. */
function WhiteboardPage() {
  const t = useTranslations("whiteboard");
  const locale = useLocale() as "en" | "ar";
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const pack = getPack(profile.packId);

  const [topic, setTopic] = useState(() => (params.get("topic") ?? "").slice(0, 200));
  const [subject, setSubject] = useState("");
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [paused, setPaused] = useState(true);
  const [segment, setSegment] = useState(0);
  const [picked, setPicked] = useState<PickedShape | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});
  useEffect(() => {
    getRepo3().prefs.get().then(setPrefs).catch(() => {});
  }, []);
  const teacher = teacherFor(prefs, subject || null);

  useEffect(() => setRecent(loadRecent()), []);

  // "Send to whiteboard" from the solver: replay that solution as a lesson.
  useEffect(() => {
    if (params.get("from") !== "solver") return;
    let data: { problem: string; solution: { topic?: string } } | null = null;
    try {
      data = JSON.parse(sessionStorage.getItem("soussy.whiteboard.fromSolver") ?? "null");
      sessionStorage.removeItem("soussy.whiteboard.fromSolver");
    } catch {
      data = null;
    }
    if (!data) return;
    setTopic(data.solution.topic ?? "");
    setLoading(true);
    fetch("/api/whiteboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem: data.problem, solution: data.solution, language: locale }),
    })
      .then(async (res) => {
        const d = (await res.json()) as { lesson?: Lesson; message?: string };
        if (!res.ok || !d.lesson) throw new Error(d.message ?? String(res.status));
        setLesson(d.lesson);
        setCached(false);
      })
      .catch((err) => setError(t("error", { message: err instanceof Error ? err.message : "?" })))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function explain(e?: React.FormEvent) {
    e?.preventDefault();
    const tp = topic.trim();
    if (tp.length < 2 || loading) return;
    const enrollment = profile.enrollments.find((x) => x.subjectId === subject);
    const key = lessonKey(`${enrollment?.name ?? ""} ${tp}`, enrollment?.level ?? "", locale);
    setError(null);
    setAnswer(null);
    setPicked(null);
    // Replays from this device are instant and free.
    const local = recent.find((r) => r.key === key);
    if (local) {
      setLesson(local.lesson);
      setCached(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: tp,
          subject: enrollment?.name,
          level: enrollment && enrollment.level !== "None" ? enrollment.level : undefined,
          curriculum: curriculumName(pack?.id),
          language: locale,
        }),
      });
      const data = (await res.json()) as { lesson?: Lesson; cached?: boolean; message?: string };
      if (!res.ok || !data.lesson) throw new Error(data.message ?? String(res.status));
      setLesson(data.lesson);
      setCached(Boolean(data.cached));
      const next = [{ key, topic: tp, lesson: data.lesson }, ...recent.filter((r) => r.key !== key)];
      setRecent(next);
      saveRecent(next);
    } catch (err) {
      setError(t("error", { message: err instanceof Error ? err.message : "?" }));
    } finally {
      setLoading(false);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!lesson || !question.trim()) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/whiteboard/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: lesson.title, segment: lesson.segments[segment]?.say ?? "", shape: picked, question, language: locale, teacher: teacherPrompt(teacher) }),
      });
      const data = (await res.json()) as { answer?: string; message?: string };
      const text = data.answer ?? data.message ?? "…";
      setAnswer(text);
      if (data.answer) speak(data.answer, locale, teacher.voice);
    } finally {
      setAsking(false);
    }
  }

  const onPausedChange = useCallback((p: boolean, s: number) => {
    setPaused(p);
    setSegment(s);
    if (!p) setAnswer(null);
  }, []);

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />

      <form onSubmit={explain} className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Input
            id="wb-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t("topicPlaceholder")}
            aria-label={t("topic")}
            className="h-12 min-w-0 flex-1 basis-64"
            dir="auto"
            maxLength={200}
          />
          <Select id="wb-subject" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t("subject")} className="h-12 w-auto basis-48">
            <option value="">{t("anySubject")}</option>
            {profile.enrollments.map((s) => (
              <option key={s.subjectId} value={s.subjectId}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button type="submit" size="lg" disabled={loading || topic.trim().length < 2}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {loading ? t("making") : t("explain")}
          </Button>
        </div>
        <p className="text-xs text-muted">{t("shared")}</p>
      </form>

      {error && (
        <p role="alert" className="rounded-[10px] bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-w-0 flex-col gap-3">
          {lesson ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold" dir="auto">
                  {lesson.title}
                </h2>
                {cached && <Chip>{t("cached")}</Chip>}
                <span className="ms-auto">
                  <TeacherPicker
                    prefs={prefs}
                    subjectCode={subject || null}
                    subjectName={profile.enrollments.find((e) => e.subjectId === subject)?.name}
                    onChange={(p) => {
                      setPrefs(p);
                      getRepo3().prefs.set(p).catch(() => {});
                    }}
                  />
                </span>
              </div>
              <WhiteboardPlayer lesson={lesson} autoPlay onPausedChange={onPausedChange} onPick={setPicked} picked={picked} voice={teacher.voice} startMuted={!playsAudioHere()} />
              <p className="text-xs text-muted">{t("voiceNote")}</p>
            </>
          ) : (
            <EmptyState icon={<PenTool className="size-8" />} title={t("empty")} className="aspect-[16/10] w-full" />
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          {lesson && (
            <Card className="flex flex-col gap-3 p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <MessageCircleQuestion className="size-5 text-primary" aria-hidden />
                {t("askTitle")}
              </h2>
              <p className="text-sm text-muted">{t("askHint")}</p>
              {paused && (
                <p className="text-sm" data-testid="picked">
                  {picked ? t("picked", { name: picked.label || picked.text || picked.kind }) : t("nothingPicked")}
                </p>
              )}
              <form onSubmit={ask} className="flex flex-col gap-2">
                <textarea
                  id="wb-question"
                  rows={3}
                  dir="auto"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t("askPlaceholder")}
                  aria-label={t("askPlaceholder")}
                  className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
                <Button type="submit" disabled={!question.trim() || asking} className="self-start">
                  {asking ? t("asking") : t("ask")}
                </Button>
              </form>
              {answer && (
                <p className="rounded-[10px] bg-primary-soft p-3 text-sm leading-6" dir="auto" data-testid="answer">
                  {answer}
                </p>
              )}
            </Card>
          )}
          {recent.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("recent")}</h2>
              <ul className="flex flex-col gap-1">
                {recent.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setTopic(r.topic);
                        setLesson(r.lesson);
                        setCached(true);
                        setAnswer(null);
                        setPicked(null);
                      }}
                      className="w-full truncate rounded-[8px] px-2 py-2 text-start text-sm hover:bg-surface-2"
                      dir="auto"
                    >
                      {r.lesson.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <WhiteboardPage />
    </Suspense>
  );
}
