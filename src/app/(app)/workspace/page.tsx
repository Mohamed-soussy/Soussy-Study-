"use client";

import { Bookmark, GripVertical, Smartphone, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { sendToOtherDevice } from "@/components/devices/device-sync";
import { Button } from "@/components/ui/button";
import { Input, PageHeader, Select } from "@/components/ui/primitives";
import { getRepo3, type Prefs } from "@/lib/data/repo3";
import { cn } from "@/lib/utils";

/** Panels that can sit side by side (section 4A). Each is a normal page shown without the app frame. */
const PANELS = [
  { id: "whiteboard", path: "/whiteboard" },
  { id: "chat", path: "/hub" },
  { id: "files", path: "/hub?tab=files" },
  { id: "flashcards", path: "/flashcards" },
  { id: "solver", path: "/solver" },
  { id: "calendar", path: "/calendar" },
  { id: "notes", path: "/notes" },
  { id: "focus", path: "/focus" },
] as const;

const DRAG = "application/x-soussy-panel";
const withEmbed = (path: string) => `${path}${path.includes("?") ? "&" : "?"}embed=1`;

function Pane({ path, label, onClear }: { path: string; label: string; onClear?: () => void }) {
  const t = useTranslations("devices");
  const ref = useRef<HTMLIFrameElement>(null);
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={() => {
            // Send whatever this pane shows now (it may have navigated inside).
            const loc = ref.current?.contentWindow?.location;
            const current = loc ? `${loc.pathname}${loc.search.replace(/[?&]embed=1/, "")}` : path;
            sendToOtherDevice(current, label);
          }}
          className="rounded p-1 text-muted hover:text-text"
          title={t("send")}
          aria-label={t("send")}
        >
          <Smartphone className="size-4" />
        </button>
        {onClear && (
          <button type="button" onClick={onClear} className="rounded p-1 text-muted hover:text-text" aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>
      <iframe ref={ref} key={path} src={withEmbed(path)} title={label} className="min-h-0 w-full flex-1 border-0" />
    </div>
  );
}

function Workspace() {
  const t = useTranslations("workspace");
  const params = useSearchParams();
  const repo3 = getRepo3();
  const [left, setLeft] = useState<string>(() => params.get("left") || "/whiteboard");
  const [right, setRight] = useState<string>(() => params.get("right") || "/hub");
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<"left" | "right" | null>(null);
  const [panelDrag, setPanelDrag] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [name, setName] = useState("");
  const [mobilePane, setMobilePane] = useState<0 | 1>(0);
  // Load only the layout for this screen size (each pane is a live page).
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setNarrow(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    repo3.prefs.get().then(setPrefs).catch(() => {});
  }, [repo3]);

  const labelFor = (path: string) => {
    const p = PANELS.find((x) => x.path === path) ?? PANELS.find((x) => path.startsWith(x.path.split("?")[0]) && x.path.split("?")[0] !== "/hub");
    return p ? t(`p.${p.id}`) : path;
  };

  const layouts = prefs.layouts ?? [];
  const saveLayouts = (l: NonNullable<Prefs["layouts"]>) => {
    const next = { ...prefs, layouts: l };
    setPrefs(next);
    repo3.prefs.set(next).catch(() => {});
  };

  // Drag the divider to resize.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const r = wrap.current?.getBoundingClientRect();
      if (!r) return;
      const rtl = document.documentElement.dir === "rtl";
      const x = rtl ? r.right - e.clientX : e.clientX - r.left;
      setSplit(Math.min(80, Math.max(20, (x / r.width) * 100)));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

  const dropZone = (side: "left" | "right") => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG)) return;
      e.preventDefault();
      setOver(side);
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      const path = e.dataTransfer.getData(DRAG);
      setOver(null);
      setPanelDrag(false);
      if (!path) return;
      if (side === "left") setLeft(path);
      else setRight(path);
    },
  });

  return (
    <>
      <PageHeader title={t("title")} text={t("text")} />

      {/* Panel chips: drag one onto a side (section 4A), or pick from the menus. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("panels")}</span>
        {PANELS.map((p) => (
          <span
            key={p.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG, p.path);
              setPanelDrag(true);
            }}
            onDragEnd={() => setPanelDrag(false)}
            className="inline-flex cursor-grab items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-sm font-medium active:cursor-grabbing"
          >
            <GripVertical className="size-3.5 text-muted" aria-hidden />
            {t(`p.${p.id}`)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label={t("left")} value={PANELS.some((p) => p.path === left) ? left : ""} onChange={(e) => e.target.value && setLeft(e.target.value)} className="h-9 w-auto">
          {!PANELS.some((p) => p.path === left) && <option value="">{labelFor(left)}</option>}
          {PANELS.map((p) => (
            <option key={p.id} value={p.path}>
              {t("left")}: {t(`p.${p.id}`)}
            </option>
          ))}
        </Select>
        <Select aria-label={t("right")} value={PANELS.some((p) => p.path === right) ? right : ""} onChange={(e) => e.target.value && setRight(e.target.value)} className="h-9 w-auto">
          {!PANELS.some((p) => p.path === right) && <option value="">{labelFor(right)}</option>}
          {PANELS.map((p) => (
            <option key={p.id} value={p.path}>
              {t("right")}: {t(`p.${p.id}`)}
            </option>
          ))}
        </Select>
        <form
          className="ms-auto flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            saveLayouts([...layouts.filter((l) => l.name !== name.trim()), { name: name.trim(), left, right, split }]);
            setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("layoutName")} aria-label={t("layoutName")} className="h-9 w-40" dir="auto" />
          <Button type="submit" size="sm" variant="outline" className="h-9">
            <Bookmark aria-hidden />
            {t("save")}
          </Button>
        </form>
      </div>
      {layouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("saved")}</span>
          {layouts.map((l) => (
            <span key={l.name} className="inline-flex items-center rounded-full bg-primary-soft text-sm font-medium text-primary">
              <button
                type="button"
                className="px-3 py-1"
                onClick={() => {
                  setLeft(l.left);
                  setRight(l.right);
                  setSplit(l.split);
                }}
                dir="auto"
              >
                {l.name}
              </button>
              <button type="button" className="pe-2" aria-label={`${t("remove")} ${l.name}`} onClick={() => saveLayouts(layouts.filter((x) => x.name !== l.name))}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Desktop and tablet: two panes with a divider. */}
      {narrow === false && (
      <div ref={wrap} className="relative flex h-[calc(100dvh-300px)] min-h-[480px]" style={{ userSelect: dragging ? "none" : undefined }}>
        <div className="relative h-full min-w-0" style={{ width: `${split}%` }} {...dropZone("left")}>
          <Pane path={left} label={labelFor(left)} />
          {(panelDrag || dragging) && (
            <div className={cn("absolute inset-0 rounded-[var(--radius-card)]", panelDrag && "border-2 border-dashed border-primary bg-primary-soft/70", over === "left" && "bg-primary-soft")}>
              {panelDrag && <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary">{t("dropHere")}</span>}
            </div>
          )}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={Math.round(split)}
          tabIndex={0}
          onPointerDown={() => setDragging(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setSplit((s) => Math.max(20, s - 5));
            if (e.key === "ArrowRight") setSplit((s) => Math.min(80, s + 5));
          }}
          className="mx-1 flex w-2 cursor-col-resize items-center justify-center rounded-full hover:bg-primary-soft focus-visible:bg-primary-soft"
        >
          <span className="h-10 w-1 rounded-full bg-border" />
        </div>
        <div className="relative h-full min-w-0 flex-1" {...dropZone("right")}>
          <Pane path={right} label={labelFor(right)} />
          {(panelDrag || dragging) && (
            <div className={cn("absolute inset-0 rounded-[var(--radius-card)]", panelDrag && "border-2 border-dashed border-primary bg-primary-soft/70", over === "right" && "bg-primary-soft")}>
              {panelDrag && <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-primary">{t("dropHere")}</span>}
            </div>
          )}
        </div>
      </div>

      )}

      {/* Phones: one pane at a time, swipe between them. */}
      {narrow && (
      <div className="flex flex-col gap-2">
        <div role="tablist" className="inline-flex self-start rounded-[10px] bg-surface-2 p-1">
          {[left, right].map((p, i) => (
            <button key={i} type="button" role="tab" aria-selected={mobilePane === i} onClick={() => {
              setMobilePane(i as 0 | 1);
              document.getElementById(`pane-${i}`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
            }} className={cn("rounded-[8px] px-3 py-1.5 text-sm font-medium", mobilePane === i ? "bg-surface text-primary shadow-sm" : "text-muted")}>
              {labelFor(p)}
            </button>
          ))}
        </div>
        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto"
          aria-label={t("swipe")}
          onScroll={(e) => setMobilePane(e.currentTarget.scrollLeft > e.currentTarget.clientWidth / 2 ? 1 : 0)}
        >
          {[left, right].map((p, i) => (
            <div key={i} id={`pane-${i}`} className="h-[70dvh] w-full shrink-0 snap-start">
              <Pane path={p} label={labelFor(p)} />
            </div>
          ))}
        </div>
      </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Workspace />
    </Suspense>
  );
}
