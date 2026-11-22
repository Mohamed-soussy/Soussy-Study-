"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** Any page that crashes shows this instead of a blank "Application error" screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("appError");
  useEffect(() => {
    console.error(error);
  }, [error]);
  const signOut = async () => {
    await getSupabaseBrowser()?.auth.signOut().catch(() => {});
    window.location.href = "/sign-in";
  };
  return (
    <main className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("text")}</p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>{t("retry")}</Button>
        <Button variant="outline" onClick={signOut}>{t("signOut")}</Button>
      </div>
      <details className="text-xs text-muted">
        <summary>{t("details")}</summary>
        <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}{error.digest ? `\n#${error.digest}` : ""}</pre>
      </details>
    </main>
  );
}
