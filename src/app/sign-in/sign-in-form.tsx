"use client";

import { FlaskConical } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Turnstile, TURNSTILE_SITE_KEY, type TurnstileHandle } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Card, Field, Input } from "@/components/ui/primitives";
import { startDemoSession } from "@/lib/profile/store";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

/**
 * Sign in or create an account with Google, Microsoft or email + password
 * (section 3, step 1). Without the Supabase key, offers demo mode instead.
 */
export function SignInForm({ configured }: { configured: boolean }) {
  const t = useTranslations("signIn");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();
  const params = useSearchParams();
  // An error passed back from Google / the email link (/auth/callback?error=…).
  useEffect(() => {
    const e = params.get("error");
    if (e) setError(t("error", { message: e }));
  }, [params, t]);

  /** Plain-language versions of Supabase's sign-in errors. */
  const friendly = (msg: string): string => {
    if (/invalid login credentials/i.test(msg)) return t("errWrong");
    if (/email not confirmed/i.test(msg)) return t("errNotConfirmed");
    if (/already registered|already been registered|user already exists/i.test(msg)) return t("errExists");
    if (/captcha/i.test(msg)) return t("errCaptcha");
    if (/rate limit|too many/i.test(msg)) return t("errTooMany");
    if (/password should|weak password|at least/i.test(msg)) return t("errWeak");
    if (/fetch|network/i.test(msg)) return t("errNetwork");
    return t("error", { message: msg });
  };
  // Robot check (only when a Turnstile site key is set; Supabase checks the token).
  const [captcha, setCaptcha] = useState<string | null>(null);
  const turnstile = useRef<TurnstileHandle>(null);
  const needCaptcha = Boolean(TURNSTILE_SITE_KEY) && !captcha;
  // Only show sign-in buttons for providers switched on in Supabase (no error for students).
  const [providers, setProviders] = useState<{ google: boolean; azure: boolean }>({ google: true, azure: false });
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
      .then((r) => r.json())
      .then((d: { external?: Record<string, boolean> }) => setProviders({ google: !!d.external?.google, azure: !!d.external?.azure }))
      .catch(() => {});
  }, []);
  const [notice, setNotice] = useState<string | null>(null);

  if (!configured) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-semibold text-text">{t("demoTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("demoBody")}</p>
          </div>
        </div>
        <Button
          size="lg"
          onClick={() => {
            startDemoSession();
            router.push("/onboarding");
          }}
        >
          {t("demoButton")}
        </Button>
      </Card>
    );
  }

  const supabase = getSupabaseBrowser()!;
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function oauth(provider: "google" | "azure") {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      // "azure" is Supabase's name for Microsoft sign-in. Calendar + files scopes come in phase 5.
      options: { redirectTo, scopes: provider === "azure" ? "email openid profile" : undefined },
    });
    if (error) {
      setError(friendly(error.message));
      setBusy(false);
    }
  }

  async function forgot() {
    setError(null);
    setNotice(null);
    if (!email) {
      setError(t("forgotNeedEmail"));
      return;
    }
    if (needCaptcha) {
      setError(t("captchaWait"));
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      captchaToken: captcha ?? undefined,
    });
    setBusy(false);
    turnstile.current?.reset();
    if (error) setError(friendly(error.message));
    else setNotice(t("forgotSent"));
  }

  async function withEmail(mode: "in" | "up") {
    setError(null);
    setNotice(null);
    if (needCaptcha) {
      setError(t("captchaWait"));
      return;
    }
    setBusy(true);
    const captchaToken = captcha ?? undefined;
    const result =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, captchaToken } });
    setBusy(false);
    turnstile.current?.reset(); // each token works once
    if (result.error) {
      setError(friendly(result.error.message));
      return;
    }
    // Supabase answers a sign-up for an email that already has an account with an empty identity list.
    if (mode === "up" && result.data.user && result.data.user.identities?.length === 0) {
      setError(t("errExists"));
      return;
    }
    if (mode === "up" && !result.data.session) {
      setNotice(t("checkEmail"));
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {providers.google && (
          <Button variant="outline" size="lg" disabled={busy} onClick={() => oauth("google")}>
            <GoogleIcon />
            {t("google")}
          </Button>
        )}
        {providers.azure && (
          <>
            <Button variant="outline" size="lg" disabled={busy} onClick={() => oauth("azure")}>
              <MicrosoftIcon />
              {t("microsoft")}
            </Button>
            <p className="text-center text-xs text-muted">{t("microsoftHint")}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          withEmail("in");
        }}
      >
        <Field label={t("email")} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t("password")} htmlFor="password" hint={t("passwordHint")}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Turnstile ref={turnstile} onToken={setCaptcha} onFail={(code) => setError(t(code.startsWith("1102") ? "captchaDomain" : "captchaDown", { code }))} language={locale} />
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-[10px] bg-primary-soft p-3 text-sm text-text" role="status">
            {notice}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" disabled={busy || needCaptcha}>
            {t("signInButton")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || needCaptcha || password.length < 8 || !email}
            onClick={() => withEmail("up")}
          >
            {t("signUpButton")}
          </Button>
        </div>
        <button type="button" onClick={forgot} disabled={busy} className="self-center text-sm font-medium text-primary hover:underline">
          {t("forgot")}
        </button>
      </form>
    </div>
  );
}
