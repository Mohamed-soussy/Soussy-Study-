"use client";

import { Camera, ChevronDown, FileAudio, FileImage, FileText, FileVideo, Folder as FolderIcon, FolderPlus, Loader2, Presentation, Search, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/drawer";
import { Card, Chip, EmptyState, Input } from "@/components/ui/primitives";
import { getRepo } from "@/lib/data/repo";
import type { ChunkHit, Folder, VaultFile } from "@/lib/data/types";
import { ensureDefaultFolders, formatBytes, STORAGE_QUOTA, uploadAndProcess } from "@/lib/hub/process";
import { cn, subjectColor } from "@/lib/utils";

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.csv,image/*,audio/*,video/*";
const MAX = 25 * 1024 * 1024;

function FileGlyph({ f }: { f: VaultFile }) {
  const n = f.name.toLowerCase();
  const Icon = f.mime.startsWith("image/")
    ? FileImage
    : f.mime.startsWith("audio/")
      ? FileAudio
      : f.mime.startsWith("video/")
        ? FileVideo
        : /\.pptx?$/.test(n)
          ? Presentation
          : FileText;
  return <Icon className="size-5 shrink-0 text-primary" aria-hidden />;
}

/** Material vault (section 6.1): folders, uploads, search inside files, storage meter. */
export function FilesTab() {
  const t = useTranslations("hub");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const repo = getRepo();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ChunkHit[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    ensureDefaultFolders(profile).then(setFolders).catch(() => {});
    repo.files.list().then(setFiles).catch(() => {});
  }, [profile, repo]);

  // Search inside files (debounced).
  useEffect(() => {
    if (query.trim().length < 3) {
      setHits(null);
      return;
    }
    const id = setTimeout(() => repo.chunks.search(query, undefined, 20).then(setHits).catch(() => setHits([])), 250);
    return () => clearTimeout(id);
  }, [query, repo]);

  const children = (id: string | null) => folders.filter((f) => f.parent_id === id);
  const descendants = useMemo(() => {
    if (!current) return null;
    const out = new Set([current]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) {
          out.add(f.id);
          grew = true;
        }
      }
    }
    return out;
  }, [current, folders]);
  const shown = files.filter((f) => !descendants || (f.folder_id && descendants.has(f.folder_id)));
  const used = files.reduce((a, f) => a + f.size_bytes, 0);
  const currentFolder = folders.find((f) => f.id === current);
  const subjectName = (code: string | null) => profile.enrollments.find((e) => e.subjectId === code)?.name;
  const subjectIdx = (code: string | null) => profile.enrollments.find((e) => e.subjectId === code)?.color ?? 0;

  const upsert = (f: VaultFile) => setFiles((list) => (list.some((x) => x.id === f.id) ? list.map((x) => (x.id === f.id ? f : x)) : [f, ...list]));

  async function handle(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      if (file.size > MAX) {
        setToast(t("tooLarge", { name: file.name }));
        continue;
      }
      try {
        const out = await uploadAndProcess(file, current, profile, upsert);
        if (out.tasksFound) setToast(t("foundTasks", { count: out.tasksFound }));
        else if (out.taggedSubject) setToast(t("tagged", { subject: out.taggedSubject }));
        else if (out.aiOff) setToast(t("aiOff"));
      } catch {
        setToast(t("uploadFailed", { name: file.name }));
      }
    }
  }

  function FolderRow({ f, depth }: { f: Folder; depth: number }) {
    const kids = children(f.id);
    const isOpen = open.has(f.id);
    const count = files.filter((x) => x.folder_id === f.id).length;
    return (
      <li>
        <div className={cn("flex items-center rounded-[8px]", current === f.id ? "bg-primary-soft text-primary" : "hover:bg-surface-2")} style={{ paddingInlineStart: depth * 14 }}>
          {kids.length > 0 ? (
            <button
              type="button"
              aria-label={f.name}
              aria-expanded={isOpen}
              onClick={() => setOpen((s) => (s.has(f.id) ? (s.delete(f.id), new Set(s)) : new Set(s.add(f.id))))}
              className="p-1 text-muted"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", !isOpen && "-rotate-90 rtl:rotate-90")} />
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          <button type="button" onClick={() => setCurrent(f.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pe-2 text-start text-sm">
            <FolderIcon className="size-4 shrink-0" style={{ color: depth === 0 && f.subject_code ? subjectColor(subjectIdx(f.subject_code)) : undefined }} aria-hidden />
            <span className="truncate">{f.name}</span>
            {count > 0 && <span className="ms-auto text-xs text-muted">{count}</span>}
          </button>
        </div>
        {isOpen && kids.length > 0 && (
          <ul>
            {kids.map((k) => (
              <FolderRow key={k.id} f={k} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Folder tree */}
      <aside className="flex min-w-0 flex-col gap-3">
        <Card className="max-h-[60vh] overflow-y-auto p-2 lg:max-h-[calc(100dvh-260px)]">
          <button
            type="button"
            onClick={() => setCurrent(null)}
            className={cn("flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm font-medium", !current ? "bg-primary-soft text-primary" : "hover:bg-surface-2")}
          >
            <FolderIcon className="size-4" aria-hidden />
            {t("allFiles")}
            <span className="ms-auto text-xs text-muted">{files.length}</span>
          </button>
          <ul className="mt-1">
            {children(null).map((f) => (
              <FolderRow key={f.id} f={f} depth={0} />
            ))}
          </ul>
        </Card>
        {newFolder === null ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setNewFolder("")}>
            <FolderPlus aria-hidden />
            {t("newFolder")}
          </Button>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newFolder.trim()) return;
              const f = await repo.folders.create({ parent_id: current, name: newFolder.trim(), subject_code: currentFolder?.subject_code ?? null, sort: 999 });
              setFolders((l) => [...l, f]);
              if (current) setOpen((s) => new Set(s.add(current)));
              setNewFolder(null);
            }}
          >
            <Input autoFocus aria-label={t("folderName")} placeholder={t("folderName")} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} className="h-9" />
            <Button size="sm" type="submit">
              <FolderPlus aria-hidden />
            </Button>
          </form>
        )}
        <div className="flex flex-col gap-1.5 px-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (used / STORAGE_QUOTA) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted">{t("storage", { used: formatBytes(used, locale), total: formatBytes(STORAGE_QUOTA, locale) })}</p>
        </div>
      </aside>

      {/* Files */}
      <section className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchFiles")} aria-label={t("searchFiles")} className="ps-9" />
          </div>
          <Button onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden />
            {t("upload")}
          </Button>
          <Button variant="outline" onClick={() => cameraInput.current?.click()} aria-label={t("camera")}>
            <Camera aria-hidden />
            <span className="hidden sm:inline">{t("camera")}</span>
          </Button>
          <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => e.target.files && handle(e.target.files)} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files && handle(e.target.files)} />
        </div>

        {hits ? (
          <Card className="divide-y divide-border">
            {hits.length === 0 && <p className="p-4 text-sm text-muted">{t("searchEmpty")}</p>}
            {hits.map((h) => (
              <Link key={`${h.file_id}-${h.page}`} href={`/hub/file/${h.file_id}?page=${h.page}`} className="block p-3 hover:bg-surface-2">
                <p className="text-sm font-medium">
                  {h.file_name} · <span className="text-muted">{t("pageShort", { page: h.page })}</span>
                </p>
                <p className="line-clamp-2 text-sm text-muted">{snippet(h.content, query)}</p>
              </Link>
            ))}
          </Card>
        ) : (
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) handle(e.dataTransfer.files);
            }}
            className={cn("flex flex-col gap-3 rounded-[var(--radius-card)] transition-colors", dragging && "bg-primary-soft outline-2 outline-dashed outline-primary")}
          >
            {shown.length === 0 ? (
              <EmptyState
                icon={<Upload className="size-8" />}
                title={currentFolder ? t("emptyFolder", { subject: currentFolder.name }) : t("emptyAll")}
                text={t("dropHint")}
                className="py-16"
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((f) => (
                  <li key={f.id}>
                    <Card className="flex h-full flex-col gap-2 p-4 transition-shadow hover:shadow-md">
                      <div className="flex items-start gap-2">
                        <FileGlyph f={f} />
                        <Link href={`/hub/file/${f.id}`} className="min-w-0 flex-1 font-medium leading-snug hover:text-primary hover:underline">
                          <span className="line-clamp-2 break-words">{f.name}</span>
                        </Link>
                        {confirm === f.id ? (
                          <span className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 bg-danger px-2 text-white"
                              onClick={async () => {
                                await repo.files.remove(f);
                                setFiles((l) => l.filter((x) => x.id !== f.id));
                                setConfirm(null);
                              }}
                            >
                              {t("delete")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirm(null)}>
                              ✕
                            </Button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirm(f.id)} className="rounded p-1 text-muted hover:text-danger" aria-label={t("deleteConfirm", { name: f.name })}>
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                      {f.summary && <p className="line-clamp-2 text-sm text-muted">{f.summary}</p>}
                      {f.error && f.status === "ready" && <p className="text-xs text-warning">{t(`notes.${f.error}` as "notes.empty")}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                        {f.status === "processing" ? (
                          <Chip>
                            <Loader2 className="size-3 animate-spin" aria-hidden />
                            {t("status.processing")}
                          </Chip>
                        ) : f.status === "error" ? (
                          <Chip className="text-danger">{t("status.error")}</Chip>
                        ) : null}
                        {f.subject_code && subjectName(f.subject_code) && <Chip color={subjectColor(subjectIdx(f.subject_code))}>{subjectName(f.subject_code)}</Chip>}
                        {f.topic && <Chip>{f.topic}</Chip>}
                        {f.page_count ? <span className="text-xs text-muted">{t("pages", { count: f.page_count })}</span> : null}
                        <span className="ms-auto text-xs text-muted">{formatBytes(f.size_bytes, locale)}</span>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-center text-xs text-muted">
              {t("dropHere")} · {t("dropHint")}
            </p>
          </div>
        )}
      </section>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

/** ~200 characters around the first matching word. */
function snippet(text: string, q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const lower = text.toLowerCase();
  const at = Math.max(0, Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0), text.length));
  const start = Math.max(0, at - 80);
  return (start > 0 ? "…" : "") + text.slice(start, start + 220).replace(/\s+/g, " ") + "…";
}
