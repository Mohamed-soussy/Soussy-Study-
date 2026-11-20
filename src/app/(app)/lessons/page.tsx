"use client";

import { AlertTriangle, FileAudio, Loader2, Mic, Square, Upload, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui/primitives";
import { intlLocale } from "@/lib/calendar/style";
import { getRepo5 } from "@/lib/lessons/repo";
import { JobProgress } from "@/components/lessons/progress";
import { isRunning, runLesson, useLessonJobs } from "@/lib/lessons/runner";
import type { Lesson } from "@/lib/lessons/types";
import { clock } from "@/lib/school/dates";
import { subjectColor } from "@/lib/utils";

const ACCEPT = "video/*,audio/*,.mp4,.mov,.m4a,.mp3,.wav,.webm,.vtt,.docx";
const MAX_BYTES = 2 * 1024 ** 3; // browsers struggle to decode much more than this

function kindOf(f: File): Lesson["media_kind"] | null {
  const n = f.name.toLowerCase();
  if (n.endsWith(".vtt") || n.endsWith(".docx")) return "transcript";
  if (f.type.startsWith("video/") || /\.(mp4|mov|webm)$/.test(n)) return f.type.startsWith("audio/") ? "audio" : "video";
  if (f.type.startsWith("audio/") || /\.(m4a|mp3|wav|ogg|aac)$/.test(n)) return "audio";
  return null;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Audio-only recorder for "Record in class" (section 11.1). */
function Recorder({ onDone, disabled }: { onDone: (f: File) => void; disabled: boolean }) {
  const t = useTranslations("lessons.add");
  const [state, setState] = useState<"idle" | "recording" | "denied">("idle");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const lock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((tr) => tr.stop()), []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        lock.current?.release().catch(() => {});
        const mime = r.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        onDone(new File(chunks.current, `Class recording ${new Date().toLocaleString()}.${ext}`, { type: mime }));
      };
      r.start(10000);
      rec.current = r;
      setSecs(0);
      setState("recording");
      // Keep the phone screen awake while recording.
      lock.current = await navigator.wakeLock?.request("screen").catch(() => null) ?? null;
    } catch {
      setState("denied");
    }
  };

  if (state === "recording")
    return (
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-danger">
          <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
          {t("recording")} {clock(secs)}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            rec.current?.stop();
            setState("idle");
          }}
        >
          <Square aria-hidden />
          {t("stop")}
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={start} disabled={disabled}>
        <Mic aria-hidden />
        {t("record")}
      </Button>
      {state === "denied" && <p className="text-sm text-danger">{t("micDenied")}</p>}
    </div>
  );
}

export default function LessonsPage() {
  const t = useTranslations("lessons");
  const locale = useLocale();
  const router = useRouter();
  const profile = useCurrentProfile();
  const jobs = useLessonJobs();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState(true);
  const [language, setLanguage] = useState<"" | "en" | "ar">("");
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () =>
    getRepo5()
      .lessons.list()
      .then(setLessons)
      .catch(() => setLessons([]));
  useEffect(() => {
    reload();
  }, []);
  // Refresh the list when a job finishes.
  const finished = jobs.filter((j) => j.stage === "done" || j.stage === "error").length;
  useEffect(() => {
    if (finished) reload();
  }, [finished]);

  const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
  const kind = file ? kindOf(file) : null;

  const start = async (f: File | null = file) => {
    setError("");
    if (!f) return setError(t("add.pickFile"));
    const k = kindOf(f);
    if (!k) return setError(t("add.badType"));
    if (f.size > MAX_BYTES) return setError(t("add.tooBig"));
    if (!allowed) return setError(t("add.confirmAllowed"));
    setBusy(true);
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      const lesson = await getRepo5().lessons.create({
        title: (title.trim() || `${enrollment?.name ?? t("lesson")} · ${new Date(`${date}T12:00:00`).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" })}`).slice(0, 200),
        subject_code: subject || null,
        lesson_date: date,
        media_name: f.name.slice(0, 200),
        media_kind: k,
      });
      void runLesson({ lesson, file: f, fileName: f.name, enrollments: profile.enrollments, readSlides: slides && k === "video", language });
      router.push(`/lessons/${lesson.id}`);
    } catch {
      setError(t("add.failed"));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{t("add.title")}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            id="lesson-file"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              setError(f && !kindOf(f) ? t("add.badType") : "");
            }}
          />
          <Button type="button" variant={file ? "outline" : "primary"} onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden />
            {file ? t("add.change") : t("add.upload")}
          </Button>
          <Recorder
            disabled={busy}
            onDone={(f) => {
              setFile(f);
              setSlides(false);
            }}
          />
          {file && (
            <span className="flex min-w-0 items-center gap-2 text-sm">
              {kind === "video" ? <Video className="size-4 text-muted" /> : <FileAudio className="size-4 text-muted" />}
              <span className="truncate font-medium" dir="auto">
                {file.name}
              </span>
              <span className="text-muted">· {t(`add.kind.${kind ?? "unknown"}`)}</span>
            </span>
          )}
        </div>
        <p className="text-sm text-muted">{t("add.formats")}</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("add.subject")} htmlFor="lesson-subject">
            <Select id="lesson-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">{t("add.noSubject")}</option>
              {profile.enrollments.map((e) => (
                <option key={e.subjectId} value={e.subjectId}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("add.date")} htmlFor="lesson-date">
            <Input id="lesson-date" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </Field>
          <Field label={t("add.name")} htmlFor="lesson-title" optional={t("add.optional")}>
            <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("add.namePlaceholder")} dir="auto" maxLength={200} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {kind === "video" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={slides} onChange={(e) => setSlides(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("add.readSlides")}
            </label>
          )}
          {kind !== "transcript" && (
            <label className="flex items-center gap-2">
              {t("add.language")}
              <Select value={language} onChange={(e) => setLanguage(e.target.value as "" | "en" | "ar")} className="h-8 w-auto py-0">
                <option value="">{t("add.langAuto")}</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </Select>
            </label>
          )}
        </div>

        {/* Section 11.4: only lessons the student may record and keep. */}
        <label className="flex items-start gap-2 rounded-[10px] bg-warning/10 p-3 text-sm">
          <input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
          <span>
            <span className="font-medium">{t("add.allowedTitle")}</span> {t("add.allowedText")}
          </span>
        </label>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="button" size="lg" onClick={() => start()} disabled={busy || !file}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t("add.start")}
          </Button>
          <p className="mt-2 text-sm text-muted">{t("add.howLong")}</p>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("yours")}</h2>
        {lessons === null ? (
          <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
        ) : lessons.length === 0 ? (
          <EmptyState icon={<Video className="size-8" />} title={t("empty.title")} text={t("empty.text")} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {lessons.map((l) => {
              const e = profile.enrollments.find((x) => x.subjectId === l.subject_code);
              const job = jobs.find((j) => j.lessonId === l.id);
              const active = job && isRunning(l.id);
              return (
                <li key={l.id}>
                  <Link href={`/lessons/${l.id}`} className="block h-full rounded-[var(--radius-card)] border border-border bg-surface p-4 transition hover:border-primary">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 font-semibold" dir="auto">
                        {l.title}
                      </h3>
                      {l.duration_s ? <span className="shrink-0 text-sm text-muted">{clock(l.duration_s)}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                      {e && <Chip color={subjectColor(e.color)}>{e.name}</Chip>}
                      <span>{new Date(`${l.lesson_date}T12:00:00`).toLocaleDateString(intlLocale(locale), { weekday: "short", day: "numeric", month: "short" })}</span>
                      {l.status === "ready" && <span>· {t("found", { count: l.items.length })}</span>}
                    </div>
                    <div className="mt-3">
                      {active && job ? (
                        <JobProgress job={job} />
                      ) : l.status === "error" ? (
                        <p className="flex items-center gap-2 text-sm text-danger">
                          <AlertTriangle className="size-4" /> {l.error ?? t("failed")}
                        </p>
                      ) : l.status === "processing" ? (
                        <p className="text-sm text-muted">{l.media_name === "Teams transcript" ? t("fromTeams") : t("stopped")}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
