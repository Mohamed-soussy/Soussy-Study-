"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Side panel for details and forms (section 2A: extra details open in a side
 * panel, not stacked below). Full screen on phones.
 */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-text/20 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col bg-surface shadow-2xl outline-none sm:border-s sm:border-border",
          wide ? "sm:max-w-xl" : "sm:max-w-md",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pe-[env(safe-area-inset-right)]",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-[8px] p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={closeLabel}>
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

/** Small message that fades after a few seconds. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 3200);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] start-1/2 z-50 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-sm font-medium text-background shadow-lg rtl:translate-x-1/2 md:bottom-8"
    >
      {message}
    </div>
  );
}
