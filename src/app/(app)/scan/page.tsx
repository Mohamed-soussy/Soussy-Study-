"use client";

import { Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { deviceName } from "@/components/devices/device-sync";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/primitives";
import { sync } from "@/lib/devices/sync";
import { uploadAndProcess } from "@/lib/hub/process";
import { deviceId } from "@/lib/session/store";

/** Phone as scanner (section 4A): snap a notebook page; it lands in the Study Hub and on the other device. */
export default function ScanPage() {
  const t = useTranslations("scan");
  const profile = useCurrentProfile();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setDone(null);
    try {
      const name = `Scan ${new Date().toLocaleString()}.jpg`;
      const renamed = new File([file], name, { type: file.type || "image/jpeg" });
      const out = await uploadAndProcess(renamed, null, profile, () => {});
      sync()?.send({ type: "scan", fileId: out.file.id, name, from: deviceId(), fromName: deviceName() });
      setDone(t("done", { name }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      <Card className="flex flex-col items-center gap-4 p-8">
        <Button size="lg" className="h-16 px-8" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Camera aria-hidden />}
          {busy ? t("uploading") : t("snap")}
        </Button>
        <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        {done && (
          <p className="text-center text-sm text-success" role="status">
            {done}
          </p>
        )}
      </Card>
    </>
  );
}
