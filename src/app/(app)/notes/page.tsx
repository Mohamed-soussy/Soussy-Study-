"use client";

import { Eraser, PenLine, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const DrawPad = dynamic(() => import("@/components/notes/draw-pad").then((m) => m.DrawPad), { ssr: false });

const KEY = "soussy.notes.text";

/** Notes (section 4A: "iPad is for handwriting notes and drawing"). Saved on this device. */
export default function NotesPage() {
  const t = useTranslations("notes");
  const [tab, setTab] = useState<"type" | "draw">("type");
  const [text, setText] = useState("");
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [clearKey, setClearKey] = useState(0);

  useEffect(() => {
    try {
      setText(localStorage.getItem(KEY) ?? "");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(KEY, text);
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(id);
  }, [text]);

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-[10px] bg-surface-2 p-1">
          {(["type", "draw"] as const).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium", tab === x ? "bg-surface text-primary shadow-sm" : "text-muted")}>
              {t(x)}
            </button>
          ))}
        </div>
        {tab === "draw" && (
          <>
            <Button size="sm" variant={tool === "pen" ? "primary" : "outline"} onClick={() => setTool("pen")}>
              <PenLine aria-hidden />
              {t("pen")}
            </Button>
            <Button size="sm" variant={tool === "eraser" ? "primary" : "outline"} onClick={() => setTool("eraser")}>
              <Eraser aria-hidden />
              {t("eraser")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setClearKey((k) => k + 1)}>
              <Trash2 aria-hidden />
              {t("clear")}
            </Button>
          </>
        )}
      </div>
      {tab === "type" ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          dir="auto"
          className="min-h-[60vh] w-full rounded-[var(--radius-card)] border border-border bg-surface p-4 text-base leading-7 focus:border-primary focus:outline-none"
        />
      ) : (
        <DrawPad tool={tool} clearKey={clearKey} />
      )}
    </>
  );
}
