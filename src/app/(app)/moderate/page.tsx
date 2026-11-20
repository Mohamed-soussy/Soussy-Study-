"use client";

import { Check, Flag, GraduationCap, ShieldAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, Chip, EmptyState, PageHeader } from "@/components/ui/primitives";
import { getRepo6, type CommunityNote, type GradeProof, type Report } from "@/lib/data/repo6";
import { getSupabaseBrowser } from "@/lib/supabase/client";

function ProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    getRepo6().images.url(path).then(setUrl).catch(() => {});
  }, [path]);
  // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
  return url ? <img src={url} alt="" className="max-h-72 rounded-[10px] border border-border" /> : null;
}

/**
 * Moderation queue (sections 9.2, 12A.5, 14): notes the AI held back, reports, and grade
 * proofs. Moderators only; the database enforces it too.
 */
export default function ModeratePage() {
  const t = useTranslations("moderate");
  const profile = useCurrentProfile();
  const repo = getRepo6();
  const [queue, setQueue] = useState<CommunityNote[]>([]);
  const [reports, setReports] = useState<(Report & { note?: CommunityNote | null })[]>([]);
  const [proofs, setProofs] = useState<GradeProof[]>([]);
  const allowed = repo.mode === "demo" || profile.role === "moderator";

  const load = useCallback(async () => {
    if (!allowed) return;
    setQueue(await repo.queue().catch(() => []));
    const open = await repo.reports.open().catch(() => []);
    setReports(await Promise.all(open.map(async (r) => ({ ...r, note: r.target_kind === "note" ? await repo.notes.get(r.target_id).catch(() => null) : null }))));
    setProofs(await repo.proofs.pending().catch(() => []));
  }, [allowed, repo]);
  useEffect(() => {
    load();
  }, [load]);

  if (!allowed) return <EmptyState icon={<ShieldAlert className="size-8" />} title={t("onlyModerators")} text={t("onlyModeratorsText")} />;

  const strike = async (r: Report, severe: boolean) => {
    const sb = getSupabaseBrowser();
    if (sb && r.target_user) await sb.rpc("room_strike", { target: r.target_user, why: r.reason, severe });
    await repo.reports.resolve(r.id, "actioned");
    load();
  };

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      {repo.mode === "demo" && <p className="self-start rounded-full bg-warning/15 px-3 py-1 text-sm font-medium text-text">{t("demo")}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("notes", { count: queue.length })}</h2>
        {queue.length === 0 && <p className="text-sm text-muted">{t("nothing")}</p>}
        {queue.map((n) => (
          <Card key={n.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold" dir="auto">{n.title}</span>
              <Chip>{n.subject_name}</Chip>
              <span className="text-sm text-muted">{n.unit} · {n.author_name}</span>
            </div>
            {n.ai_check && (
              <div className="flex flex-wrap gap-2 text-xs">
                <Chip className={n.ai_check.verdict === "reject" ? "border-danger/50 text-danger" : "border-warning/50 text-warning"}>{t(`verdict.${n.ai_check.verdict}`)}</Chip>
                {(["copied_material", "personal_data", "unsafe"] as const).filter((k) => n.ai_check![k]).map((k) => (
                  <Chip key={k} className="border-danger/50 text-danger">{t(`flags.${k}`)}</Chip>
                ))}
                {!n.ai_check.on_topic && <Chip className="border-warning/50">{t("flags.off_topic")}</Chip>}
                <span className="text-muted" dir="auto">{n.ai_check.reason}</span>
              </div>
            )}
            {n.image_path && <ProofImage path={n.image_path} />}
            <div className="max-h-64 overflow-y-auto rounded-[10px] bg-surface-2 p-3">
              <Markdown content={n.body || "—"} citations={[]} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => { await repo.notes.update(n.id, { status: "approved" }); load(); }}>
                <Check aria-hidden /> {t("approve")}
              </Button>
              <Button size="sm" variant="outline" className="text-danger" onClick={async () => { await repo.notes.update(n.id, { status: "rejected" }); load(); }}>
                <X aria-hidden /> {t("reject")}
              </Button>
            </div>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Flag className="size-5" aria-hidden /> {t("reports", { count: reports.length })}</h2>
        {reports.length === 0 && <p className="text-sm text-muted">{t("nothing")}</p>}
        {reports.map((r) => (
          <Card key={r.id} className="flex flex-col gap-2 p-4">
            <p className="text-sm">
              <Chip>{t(`kinds.${r.target_kind}`)}</Chip> <span className="font-medium">{t(`reasons.${r.reason}`)}</span>
              {r.details && <span className="text-muted"> · {r.details}</span>}
            </p>
            {r.note && <p className="text-sm font-medium" dir="auto">{r.note.title} · {r.note.author_name}</p>}
            <div className="flex flex-wrap gap-2">
              {r.target_kind === "note" && r.note && (
                <Button size="sm" variant="outline" className="text-danger" onClick={async () => { await repo.notes.update(r.target_id, { status: "removed" }); await repo.reports.resolve(r.id, "actioned"); load(); }}>
                  {t("removeNote")}
                </Button>
              )}
              {r.target_kind === "room" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => strike(r, false)}>{t("strike")}</Button>
                  <Button size="sm" variant="outline" className="text-danger" onClick={() => strike(r, true)}>{t("permanent")}</Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={async () => { await repo.reports.resolve(r.id, "dismissed"); load(); }}>{t("dismiss")}</Button>
            </div>
          </Card>
        ))}
        <p className="text-xs text-muted">{t("strikeRules")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><GraduationCap className="size-5" aria-hidden /> {t("proofs", { count: proofs.length })}</h2>
        {proofs.length === 0 && <p className="text-sm text-muted">{t("nothing")}</p>}
        {proofs.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2 p-4">
            <p className="text-sm">{t("claims", { grade: p.grade })}</p>
            <ProofImage path={p.image_path} />
            <div className="flex gap-2">
              <Button size="sm" onClick={async () => { await repo.proofs.decide(p, true); load(); }}><Check aria-hidden /> {t("approveBadge")}</Button>
              <Button size="sm" variant="outline" onClick={async () => { await repo.proofs.decide(p, false); load(); }}><X aria-hidden /> {t("reject")}</Button>
            </div>
          </Card>
        ))}
      </section>
    </>
  );
}
