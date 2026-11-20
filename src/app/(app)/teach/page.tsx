"use client";

import { CalendarPlus, Copy, Loader2, Plus, School, ShieldCheck, Trash2, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import { getRepo7, type ClassPost, type SchoolClass } from "@/lib/data/repo7";

function TeacherClass({ c }: { c: SchoolClass }) {
  const t = useTranslations("teach");
  const locale = useLocale();
  const repo = getRepo7();
  const [posts, setPosts] = useState<ClassPost[]>([]);
  const [size, setSize] = useState<number | null>(null);
  const [weak, setWeak] = useState<{ topic: string; students: number; mistakes: number }[] | null>(null);
  const [form, setForm] = useState({ title: "", body: "", url: "", due: "" });
  const load = useCallback(() => {
    repo.classes.posts(c.id).then(setPosts).catch(() => {});
    repo.classes.size(c.id).then(setSize).catch(() => {});
    repo.classes.weakTopics(c.id).then(setWeak).catch(() => setWeak([]));
  }, [c.id, repo]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto font-semibold" dir="auto">{c.name}</h3>
        <span className="text-sm text-muted">{t("students", { n: size ?? 0 })}</span>
        <span className="font-mono text-sm">{c.code}</span>
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(c.code)} aria-label={t("copyCode")}><Copy aria-hidden /></Button>
      </div>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          await repo.classes.post({ class_id: c.id, title: form.title.trim(), body: form.body.trim() || null, url: /^https:\/\//.test(form.url) ? form.url : null, due: form.due ? new Date(`${form.due}T08:00:00`).toISOString() : null });
          setForm({ title: "", body: "", url: "", due: "" });
          load();
        }}
      >
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("postTitle")} aria-label={t("postTitle")} dir="auto" />
        <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" aria-label={t("link")} dir="ltr" />
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2} placeholder={t("postBody")} aria-label={t("postBody")} dir="auto" className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary sm:col-span-2" />
        <Input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} aria-label={t("due")} />
        <Button type="submit" disabled={!form.title.trim()}><Plus aria-hidden />{t("post")}</Button>
      </form>
      <ul className="flex flex-col divide-y divide-border text-sm">
        {posts.map((p) => (
          <li key={p.id} className="flex items-start gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium" dir="auto">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.title}</a> : p.title}</p>
              {p.body && <p className="text-muted" dir="auto">{p.body}</p>}
              {p.due && <p className="text-xs text-muted">{t("dueOn", { date: new Date(p.due).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) })}</p>}
            </div>
            <button type="button" onClick={async () => { await repo.classes.removePost(p.id); load(); }} aria-label={t("remove")} className="text-muted hover:text-danger"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
      <div>
        <h4 className="text-sm font-semibold">{t("weakTitle")}</h4>
        {weak && weak.length ? (
          <table className="mt-1 w-full text-sm">
            <thead><tr className="text-muted"><th className="py-1 text-start font-medium">{t("topic")}</th><th className="py-1 text-end font-medium">{t("studentsCol")}</th><th className="py-1 text-end font-medium">{t("mistakes")}</th></tr></thead>
            <tbody>{weak.map((w) => <tr key={w.topic} className="border-t border-border"><td className="py-1" dir="auto">{w.topic}</td><td className="py-1 text-end tabular-nums">{w.students}</td><td className="py-1 text-end tabular-nums">{w.mistakes}</td></tr>)}</tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">{t("weakEmpty")}</p>
        )}
      </div>
    </Card>
  );
}

/** Teacher mode (section 12.5), and "My classes" for students. */
export default function TeachPage() {
  const t = useTranslations("teach");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const repo = getRepo7();
  const isTeacher = profile.role === "teacher" || profile.role === "moderator" || repo.mode === "demo";
  const [teaching, setTeaching] = useState<SchoolClass[]>([]);
  const [joined, setJoined] = useState<SchoolClass[]>([]);
  const [posts, setPosts] = useState<(ClassPost & { className: string })[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isTeacher) setTeaching(await repo.classes.teaching().catch(() => []));
    const j = await repo.classes.joined().catch(() => []);
    setJoined(j);
    const all = await Promise.all(j.map(async (c) => (await repo.classes.posts(c.id)).map((p) => ({ ...p, className: c.name }))));
    setPosts(all.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)));
  }, [isTeacher, repo]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title={isTeacher ? t("titleTeacher") : t("titleStudent")} text={isTeacher ? t("textTeacher") : t("textStudent")} />
      {repo.mode === "demo" && <p className="self-start rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-text">{t("demo")}</p>}

      {isTeacher && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link href="/vault"><ShieldCheck aria-hidden />{t("verifyNotes")}</Link></Button>
            <Button variant="outline" asChild><Link href="/lessons"><Video aria-hidden />{t("recordLesson")}</Link></Button>
          </div>
          <Card className="flex flex-col gap-2 p-4">
            <h2 className="font-semibold">{t("newClass")}</h2>
            <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (name.trim().length < 2) return; setBusy(true); try { await repo.classes.create(name.trim(), subject || null); setName(""); load(); } catch (err) { setMsg(err instanceof Error ? err.message : ""); } finally { setBusy(false); } }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("className")} aria-label={t("className")} className="w-64" dir="auto" />
              <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto" aria-label={t("subject")}>
                <option value="">{t("anySubject")}</option>
                {profile.enrollments.map((e) => <option key={e.subjectId} value={e.subjectId}>{e.name}</option>)}
              </Select>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <School aria-hidden />}{t("create")}</Button>
            </form>
            {msg && <p className="text-sm text-danger">{msg}</p>}
          </Card>
          {teaching.map((c) => <TeacherClass key={c.id} c={c} />)}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("myClasses")}</h2>
        <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setMsg(""); try { await repo.classes.join(code); setCode(""); load(); } catch (err) { setMsg(err instanceof Error ? err.message : ""); } }}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))} placeholder={t("classCode")} aria-label={t("classCode")} className="w-40 font-mono" />
          <Button type="submit" disabled={code.length < 6}>{t("join")}</Button>
        </form>
        {joined.length === 0 ? (
          <EmptyState title={t("noClasses")} text={t("noClassesText")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-wrap items-start gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted" dir="auto">{p.className}</p>
                    <p className="font-medium" dir="auto">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.title}</a> : p.title}</p>
                    {p.body && <p className="text-sm text-muted" dir="auto">{p.body}</p>}
                  </div>
                  {p.due && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      await getRepo().events.create({ title: p.title, type: "homework", subject_code: null, starts_at: p.due!, ends_at: null, all_day: true, description: p.body, location: null, dress_code: null, estimated_minutes: null, source: "platform", confidence: null, status: "todo", in_review: false, reminders: [4320, 1440, 0], parent_id: null, repeat_every_days: null, repeat_until: null, linked_file_ids: [] });
                      setMsg(t("added"));
                    }}>
                      <CalendarPlus aria-hidden />
                      {new Date(p.due).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                    </Button>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
