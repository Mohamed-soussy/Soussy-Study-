"use client";

import { CheckCircle2, CircleDashed, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/primitives";

type Check = { id: string; ok: boolean | null; detail: string; fix?: string };

/** System check: is every key, service and migration in place on this site? (moderators) */
export default function SystemPage() {
  const t = useTranslations("system");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error === "moderators_only" ? t("moderatorsOnly") : json.error ?? String(res.status));
      setChecks(json.checks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [t]);
  useEffect(() => {
    run();
  }, [run]);
  return (
    <>
      <PageHeader
        title={t("title")}
        text={t("text")}
        action={
          <Button variant="outline" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw aria-hidden />}
            {t("again")}
          </Button>
        }
      />
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <ul className="flex flex-col gap-2">
        {(checks ?? []).map((c) => (
          <li key={c.id}>
            <Card className="flex items-start gap-3 p-4">
              {c.ok === true ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label={t("ok")} /> : c.ok === false ? <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-label={t("problem")} /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted" aria-label={t("optional")} />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t(`names.${c.id}`)}</p>
                <p className="text-sm text-muted" dir="ltr">{c.detail}</p>
                {c.ok !== true && c.fix && <p className="mt-1 text-sm" dir="ltr"><span className="font-medium">{t("fix")} </span>{c.fix}</p>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Card className="p-4 text-sm text-muted">
        <p className="font-semibold text-text">{t("manualTitle")}</p>
        <ul className="mt-1 list-disc ps-5" dir="ltr">
          <li>Supabase → Authentication → URL Configuration: Site URL = this site&apos;s address; Redirect URLs include /auth/callback.</li>
          <li>Supabase → Realtime → Settings: &quot;Allow public access&quot; off.</li>
          <li>After changing any Vercel setting: Deployments → Redeploy.</li>
        </ul>
      </Card>
    </>
  );
}
