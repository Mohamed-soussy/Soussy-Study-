"use client";

import { GraduationCap, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Field, Input, Select } from "@/components/ui/primitives";
import { awardXp } from "@/lib/progress/xp";

/** Teach-back mode: explain a topic to "Sam", who asks until the gaps show (Feynman method). */
export function TeachBack() {
  const t = useTranslations("practice.teach");
  const profile = useCurrentProfile();
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [topic, setTopic] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const e = profile.enrollments.find((x) => x.subjectId === subject);
  const level = e ? `${e.name} ${e.level !== "None" ? e.level : ""}`.trim() : "";

  const send = async (content: string) => {
    if (!content.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: content.trim() }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/coach/teach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, level, messages: history }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message ?? t("failed"));
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let out = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: out }]);
      }
      if (/##\s/.test(out)) void awardXp("quiz", 20, `teach:${topic}:${Date.now()}`);
    } catch (err) {
      setMessages([...history, { role: "assistant", content: `⚠️ ${err instanceof Error ? err.message : t("failed")}` }]);
    } finally {
      setBusy(false);
    }
  };

  if (!started)
    return (
      <Card className="flex flex-col gap-4 p-4">
        <p className="text-sm text-muted">{t("intro")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("subject")} htmlFor="tb-subject">
            <Select id="tb-subject" value={subject} onChange={(ev) => setSubject(ev.target.value)}>
              {profile.enrollments.map((x) => (
                <option key={x.subjectId} value={x.subjectId}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("topic")} htmlFor="tb-topic">
            <Input id="tb-topic" value={topic} onChange={(ev) => setTopic(ev.target.value)} placeholder={t("topicPlaceholder")} dir="auto" />
          </Field>
        </div>
        <Button className="self-start" disabled={topic.trim().length < 3} onClick={() => setStarted(true)}>
          <GraduationCap aria-hidden />
          {t("start")}
        </Button>
      </Card>
    );

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold" dir="auto">
          {t("teaching", { topic })}
        </h2>
        <Button size="sm" variant="outline" disabled={busy || messages.length < 2} onClick={() => send("done")}>
          {t("finish")}
        </Button>
      </div>
      <div className="flex max-h-[60dvh] flex-col gap-2 overflow-y-auto">
        <p className="rounded-[12px] bg-surface-2 px-3 py-2 text-sm">{t("samHello", { topic })}</p>
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="self-end rounded-[12px] bg-primary-soft px-3 py-2 text-sm" dir="auto">
              {m.content}
            </p>
          ) : (
            <div key={i} className="rounded-[12px] border border-border px-3 py-2">
              {m.content ? <Markdown content={m.content} citations={[]} /> : <Loader2 className="size-4 animate-spin text-muted" />}
            </div>
          ),
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          send(text);
        }}
      >
        <textarea
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          rows={2}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          dir="auto"
          className="min-w-0 flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label={t("send")}>
          <Send aria-hidden />
        </Button>
      </form>
    </Card>
  );
}
