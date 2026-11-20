"use client";

import { ArrowLeft, CalendarPlus, Copy, Flag, Link2, Loader2, LogOut, PenTool, Send, Swords, Trash2, Trophy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, Input } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import { getRepo6 } from "@/lib/data/repo6";
import { getRepo7, squadChannel, type Squad, type SquadEvent, type SquadItem, type SquadMember, type SquadMessage } from "@/lib/data/repo7";
import { saveAttempt } from "@/lib/progress/stats";
import { awardXp } from "@/lib/progress/xp";
import { cn } from "@/lib/utils";

type Battle = Extract<SquadEvent, { type: "battle" }>;

export default function SquadPage() {
  const t = useTranslations("squads");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const profile = useCurrentProfile();
  const repo = getRepo7();
  const [squad, setSquad] = useState<Squad | null>(null);
  const [me, setMe] = useState("");
  const [members, setMembers] = useState<SquadMember[]>([]);
  const [messages, setMessages] = useState<SquadMessage[]>([]);
  const [items, setItems] = useState<SquadItem[]>([]);
  const [tab, setTab] = useState<"chat" | "shared" | "battle">("chat");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [battle, setBattle] = useState<Battle | null>(null);
  const [scores, setScores] = useState<{ nick: string; score: number; ms: number }[]>([]);
  const ch = useRef<{ send(e: SquadEvent): void; close(): void } | null>(null);
  const nick = members.find((m) => m.user_id === me)?.nickname || profile.nickname || "Student";

  const load = useCallback(async () => {
    const mine = await repo.squads.mine();
    const s = mine.find((x) => x.id === id) ?? null;
    setSquad(s);
    if (!s) return;
    setMe(await repo.me());
    setMembers(await repo.squads.members(id));
    setMessages(await repo.squads.messages(id));
    setItems(await repo.squads.items(id));
  }, [id, repo]);

  useEffect(() => {
    load();
    let alive = true;
    squadChannel(id, (e) => {
      if (e.type === "message") repo.squads.messages(id).then(setMessages);
      if (e.type === "battle") {
        setBattle(e);
        setScores([]);
        setTab("battle");
      }
      if (e.type === "score") setScores((s) => [...s.filter((x) => x.nick !== e.nick), { nick: e.nick, score: e.score, ms: e.ms }]);
    }).then((c) => (alive ? (ch.current = c) : c.close()));
    return () => {
      alive = false;
      ch.current?.close();
    };
  }, [id, load, repo]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setBlocked("");
    // Every message gets the AI check before it's posted (section 14).
    const res = await fetch("/api/squads/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) }).then((r) => r.json()).catch(() => ({ ok: true }));
    if (!res.ok) {
      setBlocked(t(`blocked.${res.reason ?? "spam"}`));
      setSending(false);
      return;
    }
    await repo.squads.post(id, nick, body);
    setText("");
    setMessages(await repo.squads.messages(id));
    ch.current?.send({ type: "message" });
    setSending(false);
  };

  if (!squad)
    return (
      <Card className="p-6 text-center">
        <p className="font-medium">{t("notMember")}</p>
        <Link href="/squads" className="text-sm font-medium text-primary hover:underline">{t("back")}</Link>
      </Card>
    );

  const owner = squad.owner_id === me;
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/squads" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t("title")}
          </Link>
          <h1 className="text-2xl font-bold" dir="auto">{squad.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{t("members", { n: members.length })}</span>·<span className="font-mono">{squad.code}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(squad.code)} className="text-primary hover:underline">
              <Copy className="inline size-3.5" aria-hidden /> {t("copyCode")}
            </button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            if (!confirm(owner ? t("deleteConfirm") : t("leaveConfirm"))) return;
            if (owner) await repo.squads.remove(id);
            else await repo.squads.leave(id);
            router.push("/squads");
          }}
        >
          {owner ? <Trash2 aria-hidden /> : <LogOut aria-hidden />}
          {owner ? t("delete") : t("leave")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <Chip key={m.user_id}>{m.nickname}{m.user_id === squad.owner_id ? " ★" : ""}</Chip>
        ))}
      </div>

      <div role="tablist" className="inline-flex self-start rounded-[10px] bg-surface-2 p-1">
        {(["chat", "shared", "battle"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium", tab === k ? "bg-surface text-primary shadow-sm" : "text-muted")}>
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <Card className="flex flex-col gap-3 p-4">
          <ul className="flex max-h-[55dvh] flex-col gap-2 overflow-y-auto">
            {messages.filter((m) => !m.hidden).map((m) => (
              <li key={m.id} className={cn("group flex max-w-[85%] flex-col rounded-[12px] px-3 py-2 text-sm", m.user_id === me ? "self-end bg-primary-soft" : "bg-surface-2")}>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold text-text">{m.nickname}</span> {fmt(m.created_at)}
                  {m.user_id !== me && (
                    <button type="button" className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={t("report")} onClick={async () => { await getRepo6().reports.create({ target_kind: "squad_message", target_id: String(m.id), reason: "rude", details: m.body.slice(0, 300), target_user: repo.mode === "live" ? m.user_id : null }); alert(t("reported")); }}>
                      <Flag className="size-3.5" />
                    </button>
                  )}
                </span>
                <span dir="auto" className="whitespace-pre-wrap">{m.body}</span>
              </li>
            ))}
            {messages.length === 0 && <li className="text-sm text-muted">{t("noMessages")}</li>}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <Input value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} placeholder={t("messagePlaceholder")} aria-label={t("messagePlaceholder")} dir="auto" />
            <Button type="submit" disabled={sending || !text.trim()} aria-label={t("send")}>
              {sending ? <Loader2 className="animate-spin" /> : <Send aria-hidden />}
            </Button>
          </form>
          {blocked && <p className="text-sm text-danger" role="alert">{blocked}</p>}
          <p className="text-xs text-muted">{t("chatRules")}</p>
        </Card>
      )}

      {tab === "shared" && <Shared squadId={id} items={items} me={me} onChange={async () => setItems(await repo.squads.items(id))} />}

      {tab === "battle" && (
        <BattlePanel
          battle={battle}
          scores={scores}
          nick={nick}
          start={(b) => {
            setBattle(b);
            setScores([]);
            ch.current?.send(b);
          }}
          report={(score, ms) => {
            const e: SquadEvent = { type: "score", battle: battle!.id, nick, score, ms };
            setScores((s) => [...s.filter((x) => x.nick !== nick), { nick, score, ms }]);
            ch.current?.send(e);
          }}
        />
      )}
    </>
  );
}

function Shared({ squadId, items, me, onChange }: { squadId: string; items: SquadItem[]; me: string; onChange: () => void }) {
  const t = useTranslations("squads.shared");
  const locale = useLocale();
  const repo = getRepo7();
  const [kind, setKind] = useState<"deadline" | "link" | "whiteboard">("deadline");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [due, setDue] = useState("");
  const [msg, setMsg] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    if (kind === "link" && !/^https:\/\//.test(url)) return setMsg(t("httpsOnly"));
    await repo.squads.addItem({ squad_id: squadId, kind, title: title.trim().slice(0, 200), url: kind === "link" ? url : null, due: kind === "deadline" && due ? new Date(`${due}T08:00:00`).toISOString() : null, data: {} });
    setTitle("");
    setUrl("");
    setDue("");
    setMsg("");
    onChange();
  };
  const toCalendar = async (i: SquadItem) => {
    await getRepo().events.create({ title: i.title, type: "test", subject_code: null, starts_at: i.due!, ends_at: null, all_day: true, description: null, location: null, dress_code: null, estimated_minutes: null, source: "manual", confidence: null, status: "todo", in_review: false, reminders: [4320, 1440, 0], parent_id: null, repeat_every_days: null, repeat_until: null, linked_file_ids: [] });
    setMsg(t("added"));
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-9 rounded-[10px] border border-border bg-surface px-2 text-sm" aria-label={t("kind")}>
          <option value="deadline">{t("kinds.deadline")}</option>
          <option value="link">{t("kinds.link")}</option>
          <option value="whiteboard">{t("kinds.whiteboard")}</option>
        </select>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "whiteboard" ? t("topic") : t("title")} aria-label={t("title")} className="h-9 w-56" dir="auto" />
        {kind === "link" && <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="URL" className="h-9 w-56" dir="ltr" />}
        {kind === "deadline" && <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t("date")} className="h-9 w-auto" />}
        <Button size="sm" className="h-9" onClick={add}>{t("add")}</Button>
      </div>
      {msg && <p className="text-sm text-muted" role="status">{msg}</p>}
      <ul className="flex flex-col divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <Chip>{t(`kinds.${i.kind === "deadline" || i.kind === "link" || i.kind === "whiteboard" ? i.kind : "link"}`)}</Chip>
            <span className="min-w-0 flex-1 font-medium" dir="auto">
              {i.kind === "link" && i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.title}</a> : i.title}
            </span>
            {i.due && <span className="text-muted">{new Date(i.due).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}</span>}
            {i.kind === "deadline" && i.due && (
              <Button size="sm" variant="ghost" onClick={() => toCalendar(i)}><CalendarPlus aria-hidden />{t("toCalendar")}</Button>
            )}
            {i.kind === "whiteboard" && (
              <Button size="sm" variant="ghost" asChild><Link href={`/whiteboard?topic=${encodeURIComponent(i.title)}`}><PenTool aria-hidden />{t("open")}</Link></Button>
            )}
            {i.kind === "link" && <Link2 className="size-4 text-muted" aria-hidden />}
            {i.user_id === me && (
              <button type="button" onClick={async () => { await repo.squads.removeItem(i.id); onChange(); }} aria-label={t("remove")} className="text-muted hover:text-danger"><Trash2 className="size-4" /></button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-muted">{t("empty")}</li>}
      </ul>
      <p className="text-xs text-muted">{t("whiteboardNote")}</p>
    </Card>
  );
}

function BattlePanel({ battle, scores, nick, start, report }: { battle: Battle | null; scores: { nick: string; score: number; ms: number }[]; nick: string; start: (b: Battle) => void; report: (score: number, ms: number) => void }) {
  const t = useTranslations("squads.battle");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    setI(0);
    setRight(0);
    setPicked(null);
    setDone(false);
    setStartedAt(Date.now());
  }, [battle?.id]);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/squads/battle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const json = await res.json();
      if (!res.ok || !json.questions?.length) throw new Error(json.message ?? t("failed"));
      start({ type: "battle", id: crypto.randomUUID(), topic, questions: json.questions, host: nick });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const board = [...scores].sort((a, b) => b.score - a.score || a.ms - b.ms);
  if (!battle || done)
    return (
      <Card className="flex flex-col gap-3 p-4">
        {board.length > 0 && battle && (
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Trophy className="size-5 text-warning" aria-hidden /> {t("results", { topic: battle.topic })}</h3>
            <ol className="mt-2 flex flex-col gap-1 text-sm">
              {board.map((s, n) => (
                <li key={s.nick} className={cn("flex justify-between rounded-[8px] px-2 py-1", s.nick === nick && "bg-primary-soft font-medium")}>
                  <span>{n + 1}. {s.nick}</span>
                  <span className="tabular-nums">{t("scoreLine", { score: s.score, total: battle.questions.length, s: Math.round(s.ms / 1000) })}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-sm text-muted">{t("intro")}</p>
        <div className="flex gap-2">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t("topic")} aria-label={t("topic")} dir="auto" />
          <Button onClick={create} disabled={busy || topic.trim().length < 3}>
            {busy ? <Loader2 className="animate-spin" /> : <Swords aria-hidden />}
            {t("start")}
          </Button>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </Card>
    );

  const q = battle.questions[i];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">{t("progress", { n: i + 1, total: battle.questions.length, host: battle.host, topic: battle.topic })}</p>
      <p className="font-medium" dir="auto">{q.q}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, j) => (
          <button
            key={j}
            type="button"
            disabled={picked !== null}
            onClick={() => {
              setPicked(j);
              const r = right + (j === q.answer ? 1 : 0);
              setRight(r);
              setTimeout(() => {
                if (i + 1 < battle.questions.length) {
                  setI(i + 1);
                  setPicked(null);
                } else {
                  const ms = Date.now() - startedAt;
                  setDone(true);
                  report(r, ms);
                  void saveAttempt({ kind: "battle", subject_code: null, unit: battle.topic, score: r, total: battle.questions.length, data: {} });
                  void awardXp("quiz", r * 3, `battle:${battle.id}`);
                }
              }, 900);
            }}
            className={cn("rounded-[10px] border px-3 py-2 text-start text-sm", picked === null && "border-border hover:border-primary", picked !== null && j === q.answer && "border-success bg-success/10", picked === j && j !== q.answer && "border-danger bg-danger/10")}
            dir="auto"
          >
            {o}
          </button>
        ))}
      </div>
    </Card>
  );
}
