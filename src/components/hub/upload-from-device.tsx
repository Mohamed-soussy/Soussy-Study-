"use client";

import { Loader2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import type { VaultFile } from "@/lib/data/types";
import { uploadAndProcess } from "@/lib/hub/process";

const MAX = 25 * 1024 * 1024;
export const DOC_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,image/*";

/**
 * Opens the device's own files (laptop, phone or tablet), saves the file to the
 * student's Study Hub and reads its text, then hands back the ready file.
 * Used wherever a feature needs a file (flashcards, solver, chat sources…).
 */
export function UploadFromDevice({
  onReady,
  accept = DOC_ACCEPT,
  label,
  variant = "outline",
  size = "sm",
}: {
  onReady: (file: VaultFile) => void;
  accept?: string;
  label?: string;
  variant?: "outline" | "secondary" | "ghost" | "primary";
  size?: "sm" | "md" | "lg";
}) {
  const t = useTranslations("hub");
  const profile = useCurrentProfile();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handle(file: File) {
    setError("");
    if (file.size > MAX) return setError(t("tooLarge", { name: file.name }));
    setBusy(file.name);
    let last: VaultFile | null = null;
    try {
      await uploadAndProcess(file, null, profile, (f) => {
        last = f;
      });
      if (last) onReady(last);
    } catch {
      setError(t("uploadFailed", { name: file.name }));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
      <Button type="button" variant={variant} size={size} disabled={Boolean(busy)} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
        {busy ? t("reading", { name: busy }) : (label ?? t("uploadDevice"))}
      </Button>
      {error && <span className="text-xs text-danger" role="alert">{error}</span>}
    </span>
  );
}
