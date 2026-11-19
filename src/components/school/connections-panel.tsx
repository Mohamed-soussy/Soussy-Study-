"use client";

import { CalendarPlus, ClipboardPaste, ExternalLink, FileDown, Link2, Loader2, RefreshCw, ShieldCheck, Trash2, Video } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Input } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import { ensureDefaultFolders, uploadAndProcess } from "@/lib/hub/process";
import { getRepo5, type Connection } from "@/lib/lessons/repo";
import { announceChange } from "@/lib/school/apply";
import { importPasted, lastMsSync, syncIcs, syncMicrosoft, type MsSync, type SyncResult } from "@/lib/school/sync";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

/** "4 minutes ago". */
function useAgo() {
  const locale = useLocale();
  return (iso: string | null) => {
    if (!iso) return null;
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (mins < 60) return rtf.format(-mins, "minute");
    if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), "hour");
    return rtf.format(-Math.round(mins / 1440), "day");
  };
}

/** Deletes calendar items one connection brought in (when the student chooses to). */
async function removeImported(prefix: string) {
  const repo = getRepo();
  const all = await repo.events.list();
  for (const e of all.filter((x) => x.external_id?.startsWith(prefix))) await repo.events.remove(e.id);
  announceChange();
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-primary" : "bg-border")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[18px]" : "start-0.5")} />
      </button>
    </label>
  );
}

/** Asks "keep what was imported, or delete it?" before removing a connection (section 10.2). */
function RemoveChoice({ onChoose, onCancel }: { onChoose: (deleteItems: boolean) => void; onCancel: () => void }) {
  const t = useTranslations("school.conn");
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-3 text-sm" role="group">
      <p className="font-medium">{t("removeAsk")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onChoose(false)}>
          {t("keepItems")}
        </Button>
        <Button size="sm" variant="outline" className="text-danger" onClick={() => onChoose(true)}>
          {t("deleteItems")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

const DEMO_PREVIEW = [
  { kind: "assignment", title: "Lab report: enthalpy of combustion", meta: "Teams · IB Chemistry HL · due Thu" },
  { kind: "assignment", title: "Questions 1–3, page 45", meta: "Teams · IB Physics HL · due Sun" },
  { kind: "meeting", title: "Physics HL — Period 3", meta: "Outlook · every Sunday and Tuesday" },
  { kind: "file", title: "Unit 4 slides – Electromagnetic induction.pptx", meta: "OneDrive · 2.1 MB" },
];

export function ConnectionsPanel() {
  const t = useTranslations("school.conn");
  const profile = useCurrentProfile();
  const params = useSearchParams();
  const ago = useAgo();
  const [conns, setConns] = useState<Connection[]>([]);
  const [ms, setMs] = useState<{ configured: boolean; missing: string[] } | null>(null);
  const [msData, setMsData] = useState<(MsSync & { at?: string }) | null>(null);
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; bad?: boolean } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => getRepo5().connections.list().then(setConns).catch(() => {}), []);
  useEffect(() => {
    load();
    setMsData(lastMsSync());
    fetch("/api/microsoft/status")
      .then((r) => r.json())
      .then(setMs)
      .catch(() => setMs({ configured: false, missing: [] }));
  }, [load]);

  // Came back from Microsoft sign-in.
  useEffect(() => {
    const err = params.get("ms_error");
    if (err) setMessage({ id: "ms", text: t(`msError.${["needs_approval", "cancelled", "expired", "not_configured"].includes(err) ? err : "failed"}`), bad: true });
    if (params.get("connected") === "microsoft") setMessage({ id: "ms", text: t("msConnected") });
  }, [params, t]);

  const summary = (r: SyncResult) => t("synced", { created: r.created, merged: r.merged, conflicts: r.conflicts });
  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    setMessage(null);
    try {
      setMessage({ id, text: await fn() });
    } catch (err) {
      setMessage({ id, text: err instanceof Error ? err.message : t("failed"), bad: true });
    } finally {
      setBusy(null);
      load();
    }
  };

  const feeds = conns.filter((c) => c.provider === "ics");
  const microsoft = conns.find((c) => c.provider === "microsoft");
  const setMsSetting = async (patch: Connection["settings"]) => {
    if (!microsoft) return;
    await getRepo5().connections.update(microsoft.id, { settings: { ...microsoft.settings, ...patch } });
    load();
  };
  const note = (id: string) =>
    message?.id === id ? (
      <p className={cn("text-sm", message.bad ? "text-danger" : "text-success")} role="status">
        {message.text}
      </p>
    ) : null;

  return (
    <section id="connections" className="flex scroll-mt-20 flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("text")}</p>
      </div>

      {/* Level 1: calendar feeds */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <CalendarPlus className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h3 className="font-semibold">{t("ics.title")}</h3>
            <p className="text-sm text-muted">{t("ics.text")}</p>
          </div>
        </div>
        {feeds.map((f) => (
          <div key={f.id} className="flex flex-col gap-2 rounded-[10px] border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 className="size-4 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                {f.label || t("ics.feed")}
              </span>
              <span className="text-xs text-muted">{f.last_sync ? t("lastSynced", { when: ago(f.last_sync) ?? "" }) : t("neverSynced")}</span>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(f.id, async () => summary(await syncIcs(f, profile.enrollments)))}>
                {busy === f.id ? <Loader2 className="animate-spin" /> : <RefreshCw aria-hidden />}
                {t("sync")}
              </Button>
              <Button size="sm" variant="ghost" aria-label={t("remove")} onClick={() => setRemoving(f.id)}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            {f.last_error && <p className="text-sm text-danger">{f.last_error}</p>}
            {removing === f.id && (
              <RemoveChoice
                onCancel={() => setRemoving(null)}
                onChoose={async (del) => {
                  setRemoving(null);
                  if (del) await removeImported(`ics:${f.id}:`);
                  await getRepo5().connections.remove(f.id);
                  load();
                }}
              />
            )}
            {note(f.id)}
          </div>
        ))}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const link = url.trim();
            if (!/^(https|webcals?):\/\//i.test(link)) return setMessage({ id: "ics-new", text: t("ics.badLink"), bad: true });
            run("ics-new", async () => {
              const conn = await getRepo5().connections.create({ provider: "ics", url: link, label: "", settings: {} });
              try {
                const r = await syncIcs(conn, profile.enrollments);
                setUrl("");
                return summary(r);
              } catch (err) {
                await getRepo5().connections.remove(conn.id);
                throw err;
              }
            });
          }}
        >
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics" aria-label={t("ics.link")} dir="ltr" inputMode="url" />
          <Button type="submit" disabled={busy !== null || !url.trim()}>
            {busy === "ics-new" ? <Loader2 className="animate-spin" /> : <CalendarPlus aria-hidden />}
            {t("ics.add")}
          </Button>
        </form>
        {note("ics-new")}
        <details className="text-sm text-muted">
          <summary className="cursor-pointer font-medium text-text">{t("ics.where")}</summary>
          <ul className="mt-2 list-disc ps-5">
            <li>{t("ics.outlook")}</li>
            <li>{t("ics.google")}</li>
            <li>{t("ics.platforms")}</li>
          </ul>
        </details>
      </Card>

      {/* Level 2: Microsoft sign-in */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0" aria-hidden>
            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
            <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
          </svg>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">{t("ms.title")}</h3>
            <p className="text-sm text-muted">{t("ms.text")}</p>
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <p className="rounded-[10px] bg-surface-2 p-3 text-sm text-muted">{t("ms.needsAccounts")}</p>
        ) : ms && !ms.configured ? (
          <div className="flex flex-col gap-2 rounded-[10px] bg-surface-2 p-3 text-sm">
            <p className="font-medium">{t("ms.notSetUp")}</p>
            <p className="text-muted">{t("ms.notSetUpText", { names: ms.missing.join(", ") })}</p>
          </div>
        ) : microsoft ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{microsoft.account}</span>
                <span className="text-muted"> · {microsoft.last_sync ? t("lastSynced", { when: ago(microsoft.last_sync) ?? "" }) : t("neverSynced")}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  run("ms", async () => {
                    const r = await syncMicrosoft(microsoft, profile.enrollments);
                    setMsData({ ...r.data, at: new Date().toISOString() });
                    return summary(r);
                  })
                }
              >
                {busy === "ms" ? <Loader2 className="animate-spin" /> : <RefreshCw aria-hidden />}
                {t("sync")}
              </Button>
            </div>
            {microsoft.last_error && <p className="text-sm text-danger">{microsoft.last_error === "reconnect" ? t("ms.reconnect") : microsoft.last_error}</p>}
            {note("ms")}

            <div className="divide-y divide-border rounded-[10px] border border-border px-3">
              <Switch label={t("ms.assignments")} checked={microsoft.settings.assignments !== false} onChange={(v) => setMsSetting({ assignments: v })} />
              <Switch label={t("ms.calendar")} checked={microsoft.settings.calendar !== false} onChange={(v) => setMsSetting({ calendar: v })} />
              <Switch label={t("ms.files")} checked={microsoft.settings.files !== false} onChange={(v) => setMsSetting({ files: v })} />
            </div>

            {msData?.assignments.status === "needs_approval" && (
              <div className="flex flex-col gap-2 rounded-[10px] bg-warning/10 p-3 text-sm">
                <p className="font-medium">{t("ms.needsApproval")}</p>
                <p className="text-muted">{t("ms.needsApprovalText")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    {/* A full page load: this route redirects to Microsoft's sign-in. */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/microsoft/connect?assignments=1">{t("ms.tryAssignments")}</a>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/school-it" target="_blank">
                      <ShieldCheck aria-hidden />
                      {t("forIt")}
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {(msData?.classes.length ?? 0) > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">{t("ms.classes", { count: msData!.classes.length })}</summary>
                <div className="mt-1 divide-y divide-border">
                  {msData!.classes.map((c) => (
                    <Switch
                      key={c.id}
                      label={c.name}
                      checked={!(microsoft.settings.mutedClasses ?? []).includes(c.id)}
                      onChange={(on) => {
                        const muted = new Set(microsoft.settings.mutedClasses ?? []);
                        if (on) muted.delete(c.id);
                        else muted.add(c.id);
                        setMsSetting({ mutedClasses: [...muted] });
                      }}
                    />
                  ))}
                </div>
              </details>
            )}

            {(msData?.files.items.length ?? 0) > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">{t("ms.recentFiles", { count: msData!.files.items.length })}</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {msData!.files.items.slice(0, 15).map((f) => (
                    <li key={f.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" dir="auto">
                        {f.name}
                      </span>
                      <a href={f.webUrl} target="_blank" rel="noreferrer" className="rounded p-1 text-muted hover:text-text" aria-label={t("ms.open")}>
                        <ExternalLink className="size-4" />
                      </a>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft disabled:opacity-50"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`file-${f.id}`, async () => {
                            const meta = (await (await fetch(`/api/microsoft/file?id=${encodeURIComponent(f.id)}`)).json()) as { url?: string; name?: string; mime?: string };
                            if (!meta.url) throw new Error(t("failed"));
                            const blob = await (await fetch(meta.url)).blob();
                            const folders = await ensureDefaultFolders(profile);
                            await uploadAndProcess(new File([blob], meta.name ?? f.name, { type: meta.mime || blob.type }), folders[0]?.id ?? null, profile, () => {});
                            return t("ms.saved", { name: f.name });
                          })
                        }
                      >
                        {busy === `file-${f.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                        {t("ms.save")}
                      </button>
                    </li>
                  ))}
                </ul>
                {message?.id.startsWith("file-") && <p className={cn("mt-1", message.bad ? "text-danger" : "text-success")}>{message.text}</p>}
              </details>
            )}

            {removing === "ms" ? (
              <RemoveChoice
                onCancel={() => setRemoving(null)}
                onChoose={async (del) => {
                  setRemoving(null);
                  await fetch("/api/microsoft/disconnect", { method: "POST" });
                  if (del) await removeImported("ms:");
                  try {
                    localStorage.removeItem("soussy.ms.last");
                  } catch {
                    /* ignore */
                  }
                  setMsData(null);
                  load();
                }}
              />
            ) : (
              <Button size="sm" variant="ghost" className="self-start text-danger" onClick={() => setRemoving("ms")}>
                {t("ms.disconnect")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button asChild className="self-start">
              {/* A full page load: this route redirects to Microsoft's sign-in. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/microsoft/connect">{t("ms.connect")}</a>
            </Button>
            <p className="text-sm text-muted">{t("ms.readOnly")}</p>
            {note("ms")}
          </div>
        )}

        {/* Rule 0: no key yet → show the screen with clearly labeled demo data. */}
        {(!isSupabaseConfigured || (ms && !ms.configured)) && (
          <div className="flex flex-col gap-2">
            <button type="button" className="self-start text-sm font-medium text-primary hover:underline" onClick={() => setPreview((p) => !p)}>
              {preview ? t("ms.hidePreview") : t("ms.preview")}
            </button>
            {preview && (
              <div className="rounded-[10px] border border-dashed border-warning p-3">
                <p className="mb-2 inline-block rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">{t("demoData")}</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {DEMO_PREVIEW.map((d) => (
                    <li key={d.title}>
                      <span className="font-medium">{d.title}</span>
                      <span className="text-muted"> · {d.meta}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Level 1: pasted text */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <ClipboardPaste className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h3 className="font-semibold">{t("paste.title")}</h3>
            <p className="text-sm text-muted">{t("paste.text")}</p>
          </div>
        </div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          dir="auto"
          aria-label={t("paste.title")}
          placeholder={t("paste.placeholder")}
          className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <Button
          className="self-start"
          disabled={busy !== null || paste.trim().length < 10}
          onClick={() =>
            run("paste", async () => {
              const r = await importPasted(paste, profile.enrollments);
              setPaste("");
              return r.found ? t("paste.found", { count: r.found }) : t("paste.none");
            })
          }
        >
          {busy === "paste" ? <Loader2 className="animate-spin" /> : <ClipboardPaste aria-hidden />}
          {t("paste.go")}
        </Button>
        {note("paste")}
      </Card>

      {/* Level 1: recordings */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Video className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{t("lessons.title")}</h3>
          <p className="text-sm text-muted">{t("lessons.text")}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/lessons">{t("lessons.go")}</Link>
        </Button>
      </Card>

      <Link href="/school-it" target="_blank" className="inline-flex items-center gap-2 self-start text-sm font-medium text-primary hover:underline">
        <ShieldCheck className="size-4" aria-hidden />
        {t("forIt")}
      </Link>
    </section>
  );
}
