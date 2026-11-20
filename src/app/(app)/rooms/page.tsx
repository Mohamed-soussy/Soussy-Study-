"use client";

import { Camera, Copy, Flag, Flame, Link2, Loader2, Lock, LogOut, ShieldCheck, Users, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, Input, PageHeader, Select } from "@/components/ui/primitives";
import { getRepo6 } from "@/lib/data/repo6";
import { ageOn } from "@/lib/profile/types";
import { loadProgress } from "@/lib/progress/stats";
import { openCamera, prepareSafety, takeSnapshot, type View } from "@/lib/rooms/camera";
import { joinRoom, ROOM_LIMIT, type RoomLink, type RoomMessage, type Tile } from "@/lib/rooms/channel";
import { md5 } from "@/lib/rooms/md5";
import { currentUnit, elapsedMs, plannedMs, useSession } from "@/lib/session/store";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const RULES = ["dressed", "substances", "weapons", "gestures", "nudity", "personal", "camera", "record"] as const;
const RULES_KEY = "soussy.rooms.rules.v1";
const EMOJIS = ["❤️", "👏", "🔥", "💪", "✅"] as const;
const PRESETS = ["keepGoing", "youCan", "backToTask", "niceStreak", "breakSoon", "goodLuck"] as const;
const REPORT_REASONS = ["nudity", "smoking", "weapons", "gesture", "personal", "bullying", "other"] as const;
const SNAP_EVERY = 10_000;
const CHECK_EVERY = 60_000;
const MAX_MS = 3 * 60 * 60_000; // rooms close after 3 hours

type Band = "13-15" | "16-17" | "18+";
const bandOf = (dob?: string): Band | "under13" | null => {
  if (!dob) return null;
  const a = ageOn(dob);
  return a < 13 ? "under13" : a < 16 ? "13-15" : a < 18 ? "16-17" : "18+";
};

/* ---------------- the room ---------------- */

function Room({ topic, title, view, onLeave }: { topic: string; title: string; view: View; onLeave: (msg?: string) => void }) {
  const t = useTranslations("rooms");
  const profile = useCurrentProfile();
  const session = useSession();
  const video = useRef<HTMLVideoElement>(null);
  const link = useRef<RoomLink | null>(null);
  const lastSent = useRef<Record<string, number>>({});
  const [me] = useState(() => crypto.randomUUID());
  const [myId, setMyId] = useState(me);
  const [tiles, setTiles] = useState<Record<string, Tile>>({});
  const [mine, setMine] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const nick = profile.nickname || t("student");

  const leave = useCallback(
    (msg?: string) => {
      link.current?.send({ type: "leave", id: myId });
      link.current?.close();
      const stream = video.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((tr) => tr.stop());
      onLeave(msg);
    },
    [myId, onLeave],
  );

  // Something flagged on this device or by the spot check: stop the feed for everyone at
  // once, leave, and file it for a moderator (section 12A.5).
  const flagged = useCallback(
    async (reason: string) => {
      const sb = getSupabaseBrowser();
      const uid = sb ? (await sb.auth.getUser()).data.user?.id : null;
      await getRepo6().reports.create({ target_kind: "room", target_id: topic, reason, details: "automatic check", target_user: uid ?? null }).catch(() => {});
      leave(t("removed"));
    },
    [leave, t, topic],
  );

  useEffect(() => {
    let alive = true;
    const videoEl = video.current;
    let snapTimer: ReturnType<typeof setInterval> | undefined;
    let checkTimer: ReturnType<typeof setInterval> | undefined;
    const closeTimer = setTimeout(() => leave(t("closed")), MAX_MS);
    let latest: string | null = null;
    (async () => {
      try {
        const sb = getSupabaseBrowser();
        const uid = sb ? (await sb.auth.getUser()).data.user?.id : null;
        const id = uid ?? me;
        setMyId(id);
        loadProgress().then((p) => setStreak(p.streak.streak)).catch(() => {});
        const [stream] = await Promise.all([openCamera(), prepareSafety()]);
        if (!alive) return stream.getTracks().forEach((tr) => tr.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        link.current = await joinRoom(
          topic,
          id,
          (m: RoomMessage) => {
            if (m.type === "snap") setTiles((all) => ({ ...all, [m.tile.id]: m.tile }));
            else if (m.type === "leave") setTiles((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== m.id)));
            else if (m.type === "react" && m.to === id) setIncoming(`${m.fromNick}: ${m.emoji ?? t(`presets.${m.preset}`)}`);
          },
          (n) => {
            if (n > ROOM_LIMIT) leave(t("full"));
          },
        );
        setStatus("live");
        const snap = async () => {
          if (!video.current) return;
          const s = await takeSnapshot(video.current, view);
          if (s.check.unsafe) return flagged(s.check.reason ?? "unsafe");
          latest = s.image;
          setMine(s.image);
          const u = currentUnit(session);
          const planned = plannedMs(session);
          link.current?.send({
            type: "snap",
            tile: {
              id,
              nick,
              grade: profile.year ?? "",
              subject: u?.subject ? profile.enrollments.find((e) => e.subjectId === u.subject)?.name ?? "" : "",
              unit: u?.name ?? "",
              ring: planned ? Math.min(1, elapsedMs(session) / planned) : 0,
              minutesLeft: planned ? Math.max(0, Math.round((planned - elapsedMs(session)) / 60000)) : null,
              streak,
              image: s.image,
              at: Date.now(),
            },
          });
        };
        await snap();
        snapTimer = setInterval(snap, SNAP_EVERY);
        checkTimer = setInterval(async () => {
          if (!latest) return;
          const r = await fetch("/api/rooms/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: latest }) }).then((x) => x.json()).catch(() => null);
          if (r && r.safe === false) flagged(r.reason ?? "unsafe");
        }, CHECK_EVERY);
      } catch {
        if (alive) setStatus("error");
      }
    })();
    // Tiles that stopped updating left without saying so.
    const sweep = setInterval(() => setTiles((all) => Object.fromEntries(Object.entries(all).filter(([, v]) => Date.now() - v.at < 35_000))), 5000);
    return () => {
      alive = false;
      clearInterval(snapTimer);
      clearInterval(checkTimer);
      clearInterval(sweep);
      clearTimeout(closeTimer);
      link.current?.close();
      const stream = videoEl?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [topic, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!incoming) return;
    const id = setTimeout(() => setIncoming(null), 4000);
    return () => clearTimeout(id);
  }, [incoming]);

  const react = (to: string, payload: { emoji?: string; preset?: string }) => {
    // At most one reaction every 30 seconds to the same person.
    if (Date.now() - (lastSent.current[to] ?? 0) < 30_000) return;
    lastSent.current[to] = Date.now();
    link.current?.send({ type: "react", from: myId, fromNick: nick, to, ...payload });
    setMenu(null);
  };

  const report = async (tile: Tile, reason: string) => {
    setReported((s) => new Set(s).add(tile.id)); // blurs for me at once
    setMenu(null);
    await getRepo6().reports.create({ target_kind: "room", target_id: topic, reason, details: null, target_user: getSupabaseBrowser() ? tile.id : null }).catch(() => {});
  };

  const others = Object.values(tiles).filter((x) => x.id !== myId);
  const u = currentUnit(session);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto text-lg font-semibold">{title}</h2>
        <Chip>
          <Users className="size-3.5" aria-hidden /> {t("people", { n: others.length + 1, max: ROOM_LIMIT })}
        </Chip>
        <Button size="sm" variant="ghost" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
          <VolumeX aria-hidden />
          {muted ? t("unmute") : t("mute")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => leave()}>
          <LogOut aria-hidden />
          {t("leave")}
        </Button>
      </div>
      {status === "error" && <p className="text-sm text-danger" role="alert">{t("cameraError")}</p>}
      {incoming && !muted && (
        <p className="self-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary shadow-md" role="status">
          {incoming}
        </p>
      )}
      <div className="relative">
        {/* The viewer's nickname over the room discourages screenshots (12A.5). */}
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-[0.07]" aria-hidden>
          <div className="flex h-full -rotate-12 flex-wrap content-center gap-x-16 gap-y-10 text-2xl font-bold">
            {Array.from({ length: 30 }, (_, i) => <span key={i}>{nick}</span>)}
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <li className="relative overflow-hidden rounded-[12px] border-2 border-primary bg-surface-2">
            <video ref={video} muted playsInline className="hidden" />
            {mine ? (
              // eslint-disable-next-line @next/next/no-img-element -- local snapshot data URL
              <img src={mine} alt={t("you")} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-muted">{status === "starting" ? <Loader2 className="animate-spin" /> : <Camera />}</div>
            )}
            <TileInfo nick={`${nick} (${t("you")})`} subject={u?.subject ? profile.enrollments.find((e) => e.subjectId === u.subject)?.name ?? "" : ""} unit={u?.name ?? ""} ring={plannedMs(session) ? Math.min(1, elapsedMs(session) / plannedMs(session)) : 0} streak={streak} />
          </li>
          {others.map((o) => (
            <li key={o.id} className="relative overflow-hidden rounded-[12px] border border-border bg-surface-2">
              {o.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- snapshot from the room channel
                <img src={o.image} alt={t("tileOf", { nick: o.nick })} className={cn("aspect-[4/3] w-full object-cover", reported.has(o.id) && "blur-xl")} />
              ) : (
                <div className="aspect-[4/3]" />
              )}
              <TileInfo nick={o.nick} subject={o.subject} unit={o.unit} ring={o.ring} streak={o.streak} />
              <button type="button" onClick={() => setMenu(menu === o.id ? null : o.id)} className="absolute end-2 top-2 rounded-full bg-surface/90 px-2 py-1 text-xs font-medium shadow" aria-expanded={menu === o.id}>
                {t("cheer")}
              </button>
              {menu === o.id && (
                <div className="absolute inset-x-2 top-10 z-20 flex flex-col gap-2 rounded-[10px] border border-border bg-surface p-2 shadow-lg">
                  <div className="flex justify-between">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" onClick={() => react(o.id, { emoji: e })} className="rounded p-1 text-lg hover:bg-surface-2" aria-label={e}>
                        {e}
                      </button>
                    ))}
                  </div>
                  {PRESETS.map((p) => (
                    <button key={p} type="button" onClick={() => react(o.id, { preset: p })} className="rounded px-2 py-1 text-start text-xs hover:bg-surface-2">
                      {t(`presets.${p}`)}
                    </button>
                  ))}
                  <details className="text-xs">
                    <summary className="flex cursor-pointer items-center gap-1 px-2 py-1 font-medium text-danger">
                      <Flag className="size-3.5" aria-hidden /> {t("report")}
                    </summary>
                    {REPORT_REASONS.map((r) => (
                      <button key={r} type="button" onClick={() => report(o, r)} className="block w-full rounded px-2 py-1 text-start hover:bg-surface-2">
                        {t(`reasons.${r}`)}
                      </button>
                    ))}
                  </details>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      {others.length === 0 && status === "live" && <p className="text-sm text-muted">{t("alone")}</p>}
      <p className="text-xs text-muted">{t("privacy")}</p>
    </div>
  );
}

function TileInfo({ nick, subject, unit, ring, streak }: { nick: string; subject: string; unit: string; ring: number; streak: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-2 text-white">
      <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
        <circle cx="12" cy="12" r={r} fill="none" stroke="white" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - ring)} strokeLinecap="round" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold" dir="auto">{nick}</span>
        <span className="block truncate text-[11px] opacity-90" dir="auto">{[subject, unit].filter(Boolean).join(" · ")}</span>
      </span>
      {streak > 0 && (
        <span className="flex items-center gap-0.5 text-xs font-semibold">
          <Flame className="size-3.5" aria-hidden />
          {streak}
        </span>
      )}
    </div>
  );
}

/* ---------------- gate and lobby ---------------- */

export default function RoomsPage() {
  const t = useTranslations("rooms");
  const profile = useCurrentProfile();
  const sb = getSupabaseBrowser();
  const [block, setBlock] = useState<string | null>(null);
  const [rulesOk, setRulesOk] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [demoApproved, setDemoApproved] = useState(false);
  const [room, setRoom] = useState<{ topic: string; title: string } | null>(null);
  const [view, setView] = useState<View>("blur");
  const [code, setCode] = useState("");
  const [guardianLink, setGuardianLink] = useState("");
  const [notice, setNotice] = useState("");
  const band = bandOf(profile.dateOfBirth);

  useEffect(() => {
    try {
      setRulesOk(localStorage.getItem(RULES_KEY) === "1");
    } catch {
      /* ignore */
    }
    if (sb) {
      sb.rpc("room_block_reason").then(({ data, error }) => setBlock(error ? "unavailable" : ((data as string) ?? "")));
    } else {
      setBlock(band === null ? "no_age" : band === "under13" ? "too_young" : band !== "18+" ? "needs_guardian" : "");
    }
  }, [sb, band]);

  const effectiveBlock = block === "needs_guardian" && demoApproved ? "" : block;

  const requestGuardian = async () => {
    if (!sb) return;
    const { data, error } = await sb.from("guardian_requests").insert({ purpose: "rooms", guardian_email: profile.guardianEmail ?? null }).select("token").single();
    if (!error && data) setGuardianLink(`${location.origin}/guardian/${data.token}`);
  };

  if (room)
    return (
      <>
        <PageHeader title={t("title")} text={t("text")} />
        <Room
          topic={room.topic}
          title={room.title}
          view={view}
          onLeave={(msg) => {
            setRoom(null);
            setNotice(msg ?? "");
          }}
        />
      </>
    );

  const school = profile.school?.trim();
  const enter = (key: string, title: string, friends = false) => {
    if (band === null || band === "under13") return;
    setNotice("");
    setRoom({ topic: `room:${band}:${friends ? "friends" : md5(school ?? "")}:${key}`.slice(0, 200), title });
  };

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      {notice && <p className="rounded-[10px] bg-warning/10 p-3 text-sm" role="status">{notice}</p>}

      {block === null ? (
        <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      ) : effectiveBlock ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Lock className="size-5 text-muted" aria-hidden /> {t(`block.${effectiveBlock}.title`)}
          </h2>
          <p className="text-sm text-muted">{t(`block.${effectiveBlock}.text`)}</p>
          {effectiveBlock === "no_age" && (
            <Button asChild variant="outline" className="self-start">
              <Link href="/onboarding?step=1">{t("addBirthday")}</Link>
            </Button>
          )}
          {effectiveBlock === "needs_guardian" && (
            <div className="flex flex-col gap-2">
              {sb ? (
                guardianLink ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={guardianLink} className="h-9 min-w-0 flex-1" aria-label={t("guardianLink")} />
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(guardianLink)}>
                      <Copy aria-hidden /> {t("copy")}
                    </Button>
                  </div>
                ) : (
                  <Button className="self-start" onClick={requestGuardian}>
                    <Link2 aria-hidden /> {t("makeGuardianLink")}
                  </Button>
                )
              ) : (
                <Button variant="outline" className="self-start" onClick={() => setDemoApproved(true)}>
                  {t("demoApprove")}
                </Button>
              )}
              <p className="text-xs text-muted">{t("guardianNote")}</p>
            </div>
          )}
        </Card>
      ) : !rulesOk ? (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" aria-hidden /> {t("rulesTitle")}
          </h2>
          <p className="text-sm text-muted">{t("rulesText")}</p>
          <ul className="flex flex-col gap-2">
            {RULES.map((r) => (
              <li key={r}>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={ticked.has(r)} onChange={(e) => setTicked((s) => { const n = new Set(s); if (e.target.checked) n.add(r); else n.delete(r); return n; })} />
                  {t(`rules.${r}`)}
                </label>
              </li>
            ))}
          </ul>
          <Button
            className="self-start"
            disabled={ticked.size < RULES.length}
            onClick={() => {
              try {
                localStorage.setItem(RULES_KEY, "1");
              } catch {
                /* ignore */
              }
              setRulesOk(true);
            }}
          >
            {t("agree")}
          </Button>
          <p className="text-xs text-muted">{t("consequences")}</p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm font-medium">{t("camera")}</span>
            <Select value={view} onChange={(e) => setView(e.target.value as View)} className="h-9 w-auto" aria-label={t("camera")}>
              <option value="blur">{t("views.blur")}</option>
              <option value="desk">{t("views.desk")}</option>
            </Select>
            <span className="text-xs text-muted">{t("viewsNote")}</span>
          </Card>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t("schoolRooms")}</h2>
            {school ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {profile.enrollments.map((e) => (
                  <li key={e.subjectId}>
                    <button type="button" onClick={() => enter(`${profile.year ?? "all"}-${e.subjectId}`, `${school.split(/[,(]/)[0].trim()} · ${profile.year?.toUpperCase() ?? ""} · ${e.name}`)} className="flex w-full flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-start hover:border-primary">
                      <span className="font-semibold">{e.name}</span>
                      <span className="text-sm text-muted">{t("schoolRoomText", { school: school.split(/[,(]/)[0].trim(), band: band ?? "" })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={t("noSchool")} text={t("noSchoolText")} />
            )}
          </section>
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="font-semibold">{t("friendsTitle")}</h2>
            <p className="text-sm text-muted">{t("friendsText")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const c = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
                  setCode(c);
                  enter(c, t("friendsRoom", { code: c }), true);
                }}
              >
                {t("newFriends")}
              </Button>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = code.trim().toUpperCase(); if (c.length >= 4) enter(c, t("friendsRoom", { code: c }), true); }}>
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 8))} placeholder={t("code")} aria-label={t("code")} className="h-10 w-32 font-mono" />
                <Button type="submit" disabled={code.trim().length < 4}>{t("join")}</Button>
              </form>
            </div>
          </Card>
          <Card className="flex items-start gap-3 p-4">
            <Lock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div>
              <h2 className="font-semibold">{t("openTitle")}</h2>
              <p className="text-sm text-muted">{t("openText")}</p>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
