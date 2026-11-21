import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { applyEnvAliases } from "./src/lib/env-aliases";

// Accept hand-typed key names from Vercel (e.g. "SupabaseURL") before the build reads them.
applyEnvAliases();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Public values only (the Supabase URL and anon key are meant to be in the browser).
  env: {
    NEXT_PUBLIC_SUPABASE_URL: (() => {
      const v = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
      try {
        return v ? new URL(v.startsWith("http") ? v : `https://${v}`).origin : "";
      } catch {
        return v;
      }
    })(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
  },
};

export default withNextIntl(nextConfig);
