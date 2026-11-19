"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

/** One-tap English ⇄ Arabic switch. The whole layout flips direction. */
export function LocaleSwitch({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLocale(next);
          router.refresh();
        })
      }
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-60",
        className,
      )}
      lang={next}
    >
      <Languages className="size-4" aria-hidden />
      {next === "ar" ? "العربية" : "English"}
    </button>
  );
}
