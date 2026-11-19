import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Logo, Wordmark } from "@/components/brand/logo";
import { LocaleSwitch } from "@/components/locale-switch";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const t = await getTranslations("signIn");
  return (
    <div className="flex min-h-dvh flex-col ps-[max(16px,env(safe-area-inset-left))] pe-[max(16px,env(safe-area-inset-right))]">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-4">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo size={28} />
          <Wordmark />
        </Link>
        <LocaleSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 pb-12">
        <div>
          <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
          <p className="mt-1 text-muted">{t("subtitle")}</p>
        </div>
        <SignInForm configured={isSupabaseConfigured} />
      </main>
    </div>
  );
}
