"use client";

import { Accessibility, Copy, Download, Gift, Loader2, ShieldCheck, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Input, Select } from "@/components/ui/primitives";
import { getA11y, setA11y, type A11y } from "@/lib/a11y/settings";
import { saveProfile } from "@/lib/profile/store";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Accessibility (section 12.5): readable font, text size, less motion, read-aloud. */
export function AccessibilityCard() {
  const t = useTranslations("settings.a11y");
  const [a, setA] = useState<A11y>({});
  useEffect(() => setA(getA11y()), []);
  const update = (patch: A11y) => {
    const next = { ...a, ...patch };
    setA(next);
    setA11y(next);
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Accessibility className="size-5" aria-hidden /> {t("title")}
      </h2>
      <Card className="flex flex-col gap-4 p-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            <span className="font-medium">{t("font")}</span>
            <span className="block text-muted">{t("fontText")}</span>
          </span>
          <input type="checkbox" checked={a.font === "readable"} onChange={(e) => update({ font: e.target.checked ? "readable" : undefined })} className="size-5 accent-[var(--primary)]" />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{t("size", { n: a.size ?? 100 })}</span>
          <input type="range" min={90} max={140} step={10} value={a.size ?? 100} onChange={(e) => update({ size: Number(e.target.value) })} className="accent-[var(--primary)]" aria-valuetext={`${a.size ?? 100}%`} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{t("motion")}</span>
          <input type="checkbox" checked={a.motion === "reduce"} onChange={(e) => update({ motion: e.target.checked ? "reduce" : undefined })} className="size-5 accent-[var(--primary)]" />
        </label>
        <p className="text-sm text-muted">{t("readAloud")}</p>
      </Card>
    </section>
  );
}

/** Invite friends (section 12.5): both students get 10 extra AI uses a day. */
export function InviteCard() {
  const t = useTranslations("settings.invite");
  const profile = useCurrentProfile();
  const sb = getSupabaseBrowser();
  const [code, setCode] = useState(profile.referralCode ?? "");
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState("");
  const link = code && typeof window !== "undefined" ? `${location.origin}/join/${code}` : "";
  const make = async () => {
    const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
    await saveProfile({ ...profile, referralCode: c });
    setCode(c);
  };
  return (
    <section id="invite" className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Gift className="size-5" aria-hidden /> {t("title")}
      </h2>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">{t("text")}</p>
        {code ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={link} className="h-9 min-w-0 flex-1" aria-label={t("link")} dir="ltr" />
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>
              <Copy aria-hidden />
              {t("copy")}
            </Button>
          </div>
        ) : (
          <Button className="self-start" onClick={make}>
            {t("make")}
          </Button>
        )}
        {sb && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const { data } = await sb.rpc("redeem_invite", { code: redeem });
              setMsg(data ? t("redeemed") : t("notRedeemed"));
            }}
          >
            <Input value={redeem} onChange={(e) => setRedeem(e.target.value.toUpperCase())} placeholder={t("haveCode")} aria-label={t("haveCode")} className="h-9 w-40 font-mono" />
            <Button size="sm" type="submit" variant="outline" className="h-9" disabled={redeem.length < 6}>
              {t("redeem")}
            </Button>
          </form>
        )}
        {msg && <p className="text-sm" role="status">{msg}</p>}
      </Card>
    </section>
  );
}

/** Parent view (section 12.5): optional, student-controlled, read-only weekly summary link. */
export function ParentCard() {
  const t = useTranslations("settings.parent");
  const sb = getSupabaseBrowser();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => data.user && sb.from("profiles").select("parent_token").eq("id", data.user.id).maybeSingle().then(({ data: p }) => setToken((p?.parent_token as string | null) ?? null)));
  }, [sb]);
  const set = async (v: string | null) => {
    if (!sb) return;
    const uid = (await sb.auth.getUser()).data.user?.id;
    await sb.from("profiles").update({ parent_token: v }).eq("id", uid ?? "");
    setToken(v);
  };
  const link = token && typeof window !== "undefined" ? `${location.origin}/parent/${token}` : "";
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="size-5" aria-hidden /> {t("title")}
      </h2>
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted">{t("text")}</p>
        {!sb ? (
          <p className="text-sm text-muted">{t("needsAccounts")}</p>
        ) : token ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={link} className="h-9 min-w-0 flex-1" aria-label={t("link")} dir="ltr" />
              <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link)}>
                <Copy aria-hidden />
                {t("copy")}
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="self-start text-danger" onClick={() => set(null)}>
              {t("off")}
            </Button>
          </>
        ) : (
          <Button className="self-start" variant="outline" onClick={() => set(Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""))}>
            {t("on")}
          </Button>
        )}
      </Card>
    </section>
  );
}

const TABLES = [
  "profiles", "enrollments", "events", "folders", "files", "file_notes", "chats", "messages", "lessons", "connections", "solutions", "mistakes",
  "flashcard_decks", "flashcards", "flashcard_reviews", "devices", "saved_resources", "community_notes", "note_ratings", "grade_proofs", "reports",
  "xp_events", "study_days", "quiz_attempts", "core_items", "squad_messages", "squad_items", "guardian_requests",
];

/** Settings → Privacy (section 14): download all my data, delete my account. */
export function PrivacyCard() {
  const t = useTranslations("settings.privacyCard");
  const sb = getSupabaseBrowser();
  const [busy, setBusy] = useState<"download" | "delete" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState("");

  const download = async () => {
    setBusy("download");
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "Soussy Study" };
    if (sb) {
      for (const table of TABLES) {
        const { data, error } = await sb.from(table).select("*").limit(10000);
        out[table] = error ? `unavailable (${error.message})` : data;
      }
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("soussy.")) {
          try {
            out[k] = JSON.parse(localStorage.getItem(k) ?? "null");
          } catch {
            out[k] = localStorage.getItem(k);
          }
        }
      }
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `soussy-study-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy(null);
  };

  const remove = async () => {
    setBusy("delete");
    setMsg("");
    if (!sb) {
      Object.keys(localStorage).filter((k) => k.startsWith("soussy.")).forEach((k) => localStorage.removeItem(k));
      location.href = "/";
      return;
    }
    const res = await fetch("/api/account/delete", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) location.href = "/";
    else {
      setMsg(json.message ?? t("failed"));
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-sm text-muted">{t("text")}</p>
      <Button variant="outline" className="self-start" onClick={download} disabled={busy !== null}>
        {busy === "download" ? <Loader2 className="animate-spin" /> : <Download aria-hidden />}
        {t("download")}
      </Button>
      <details className="rounded-[10px] border border-danger/30 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-danger">{t("delete")}</summary>
        <p className="mt-2 text-muted">{t("deleteText")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" aria-label={t("typeDelete")} className="h-9 w-32" dir="ltr" />
          <Button variant="outline" className="h-9 text-danger" disabled={confirmText !== "DELETE" || busy !== null} onClick={remove}>
            {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 aria-hidden />}
            {t("deleteForever")}
          </Button>
        </div>
        {msg && <p className="mt-2 text-danger">{msg}</p>}
      </details>
      <p className="flex items-center gap-1 text-xs text-muted">
        <ShieldCheck className="size-3.5" aria-hidden /> {t("connected")}
      </p>
    </Card>
  );
}

/** Demo only: preview the teacher and moderator tools. */
export function DemoRoleCard() {
  const t = useTranslations("settings.demoRole");
  const profile = useCurrentProfile();
  if (getSupabaseBrowser()) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 border-dashed p-4">
      <span className="text-sm font-medium">{t("label")}</span>
      <Select
        value={profile.role ?? "student"}
        onChange={async (e) => {
          await saveProfile({ ...profile, role: e.target.value as "student" | "teacher" | "moderator" });
          location.reload();
        }}
        className="h-9 w-auto"
        aria-label={t("label")}
      >
        <option value="student">{t("student")}</option>
        <option value="teacher">{t("teacher")}</option>
        <option value="moderator">{t("moderator")}</option>
      </Select>
      <span className="text-xs text-muted">{t("note")}</span>
    </Card>
  );
}
