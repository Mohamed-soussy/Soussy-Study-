"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { DevicesPanel } from "@/components/devices/devices-panel";
import { PageHeader } from "@/components/ui/primitives";

/** Opened by scanning the QR code on the other device (section 4A). Must be signed in to the same account. */
function LinkPage() {
  const t = useTranslations("devices");
  const params = useSearchParams();
  return (
    <>
      <PageHeader title={t("link")} text={t("text")} />
      <DevicesPanel initialCode={params.get("code") ?? undefined} />
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LinkPage />
    </Suspense>
  );
}
