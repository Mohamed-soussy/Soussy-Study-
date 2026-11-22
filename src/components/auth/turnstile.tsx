"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/** Public Cloudflare Turnstile site key. Without it, no robot check is shown. */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface TurnstileHandle {
  /** Tokens work once: call after every sign-in attempt. */
  reset(): void;
}

/**
 * Robot check (Cloudflare Turnstile, free). Usually invisible; sometimes asks for one tap.
 * Supabase verifies the token with the secret key set in Authentication → Attack Protection.
 */
export const Turnstile = forwardRef<TurnstileHandle, { onToken: (token: string | null) => void; onFail?: (code: string) => void; language?: string }>(function Turnstile({ onToken, onFail, language }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const fail = useRef(onFail);
  fail.current = onFail;

  useImperativeHandle(ref, () => ({
    reset() {
      cb.current(null);
      if (id.current && window.turnstile) window.turnstile.reset(id.current);
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          size: "flexible",
          language: language ?? "auto",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(null),
          "error-callback": (code: string) => {
            cb.current(null);
            fail.current?.(String(code ?? ""));
          },
        });
      })
      .catch(() => {
        cb.current(null);
        fail.current?.("load");
      });
    return () => {
      cancelled = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [language]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
});
