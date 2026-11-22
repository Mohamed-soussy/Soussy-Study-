"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { getSupabaseBrowser } from "@/lib/supabase/client";

/** After the "forgot password" email link: choose a new password. */
export default function ResetPasswordPage() {
  const t = useTranslations("resetPassword");
  const s = useTranslations("signIn");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(s("error", { message: error.message }));
    else router.push("/home");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card className="flex flex-col gap-4 p-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label={t("label")} htmlFor="new-password" hint={s("passwordHint")}>
            <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || password.length < 8}>{t("save")}</Button>
        </form>
      </Card>
    </main>
  );
}
