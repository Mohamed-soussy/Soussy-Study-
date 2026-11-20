"use client";

import { Award, Flag, GraduationCap, ImagePlus, Loader2, Merge, Plus, ShieldCheck, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Markdown } from "@/components/hub/markdown";
import { useCurrentProfile } from "@/components/shell/profile-context";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Card, Chip, EmptyState, Field, Input, Select } from "@/components/ui/primitives";
import { unitsFor } from "@/curriculum/units";
import { awardXp } from "@/lib/progress/xp";
import { getRepo } from "@/lib/data/repo";
import { getRepo6, isTopRated, type CommunityNote, type NoteKind } from "@/lib/data/repo6";
import { cn, subjectColor } from "@/lib/utils";

const KINDS: NoteKind[] = ["notes", "cheat_sheet", "mind_map", "flashcards", "traps"];
const REASONS = ["wrong", "copied", "personal", "rude", "unsafe", "other"] as const;

function Stars({ value, onRate, size = 4 }: { value: number; onRate?: (n: number) => void; size?: number }) {
  const t = useTranslations("vault.community");
  return (
    <span className="inline-flex items-center gap-0.5" role={onRate ? "radiogroup" : undefined} aria-label={onRate ? t("rate") : t("stars", { n: value.toFixed(1) })}>
      {[1, 2, 3, 4, 5].map((n) =>
        onRate ? (
          <button key={n} type="button" role="radio" aria-checked={Math.round(value) === n} aria-label={t("starsN", { n })} onClick={() => onRate(n)} className="p-0.5">
            <Star className={cn(`size-${size}`, n <= value ? "fill-warning text-warning" : "text-border")} />
          </button>
        ) : (
          <Star key={n} className={cn(`size-${size}`, n <= Math.round(value) ? "fill-warning text-warning" : "text-border")} aria-hidden />
        ),
      )}
    </span>
  );
}

function Badges({ n }: { n: CommunityNote }) {
  const t = useTranslations("vault.community.badges");
  return (
    <>
      {isTopRated(n) && (
        <Chip className="border-warning/50">
          <Award className="size-3.5 text-warning" aria-hidden /> {t("top")}
        </Chip>
      )}
      {n.teacher_approved && (
        <Chip className="border-success/50">
          <ShieldCheck className="size-3.5 text-success" aria-hidden /> {t("teacher")}
        </Chip>
      )}
      {n.grade_badge && (
        <Chip className="border-primary/50">
          <GraduationCap className="size-3.5 text-primary" aria-hidden /> {t("scored", { grade: n.grade_badge })}
        </Chip>
      )}
    </>
  );
}

/** One note, full size: rate, report, verify (teachers), prove your grade (author). */
function NoteView({ note, mine, onChanged }: { note: CommunityNote; mine: boolean; onChanged: () => void }) {
  const t = useTranslations("vault.community");
  const profile = useCurrentProfile();
  const [img, setImg] = useState<string | null>(null);
  const [myStars, setMyStars] = useState<number | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>("wrong");
  const [msg, setMsg] = useState("");
  const [grade, setGrade] = useState("7");
  const repo = getRepo6();

  useEffect(() => {
    if (note.image_path) repo.images.url(note.image_path).then(setImg).catch(() => {});
    if (!mine) repo.notes.myRating(note.id).then(setMyStars).catch(() => {});
  }, [note, mine, repo]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip>{t(`kinds.${note.kind}`)}</Chip>
        <Badges n={note} />
        <span className="text-sm text-muted">
          {note.subject_name} · {note.unit} · {note.author_name}
        </span>
      </div>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={img} alt={note.title} className="w-full rounded-[12px] border border-border" />
      )}
      {note.body && <Markdown content={note.body} citations={[]} />}

      {!mine && note.status === "approved" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="text-sm font-medium">{myStars ? t("yourRating") : t("rate")}</span>
          <Stars
            value={myStars ?? 0}
            size={5}
            onRate={async (n) => {
              try {
                await repo.notes.rate(note.id, n);
                setMyStars(n);
                onChanged();
              } catch (err) {
                setMsg(err instanceof Error ? err.message : t("failed"));
              }
            }}
          />
          {(profile.role === "teacher" || profile.role === "moderator") && !note.teacher_approved && (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await repo.notes.update(note.id, { teacher_approved: true });
                setMsg(t("verified"));
                onChanged();
              }}
            >
              <ShieldCheck aria-hidden />
              {t("verify")}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setReporting((r) => !r)}>
            <Flag aria-hidden />
            {t("report")}
          </Button>
        </div>
      )}
      {reporting && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-[10px] bg-surface-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await repo.reports.create({ target_kind: "note", target_id: note.id, reason, details: null, target_user: note.user_id });
            setReporting(false);
            setMsg(t("reported"));
          }}
        >
          <Field label={t("reason")} htmlFor="report-reason">
            <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button size="sm" type="submit">
            {t("sendReport")}
          </Button>
        </form>
      )}

      {mine && note.status === "approved" && !note.grade_badge && (
        // "Scored 7" only with proof a moderator checks (section 9.2): never self-declared.
        <form
          className="flex flex-col gap-2 rounded-[10px] border border-dashed border-border p-3 text-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            const file = (e.currentTarget.elements.namedItem("proof") as HTMLInputElement).files?.[0];
            if (!file) return;
            const path = await repo.images.upload(file, "proofs");
            await repo.proofs.create({ note_id: note.id, grade, image_path: path });
            setMsg(t("proofSent"));
          }}
        >
          <p className="font-medium">{t("proveTitle")}</p>
          <p className="text-muted">{t("proveText")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-9 w-auto" aria-label={t("grade")}>
              {["7", "6", "5", "4", "A", "B"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
            <input name="proof" type="file" accept="image/*" required className="text-sm" aria-label={t("screenshot")} />
            <Button size="sm" type="submit" variant="outline">
              <Upload aria-hidden />
              {t("sendProof")}
            </Button>
          </div>
        </form>
      )}
      {mine && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start text-danger"
          onClick={async () => {
            if (!confirm(t("deleteConfirm"))) return;
            await repo.notes.remove(note.id);
            onChanged();
          }}
        >
          <Trash2 aria-hidden />
          {t("delete")}
        </Button>
      )}
      {msg && (
        <p className="text-sm text-muted" role="status">
          {msg}
        </p>
      )}
      {note.status !== "approved" && note.ai_check?.reason && <p className="rounded-[10px] bg-surface-2 p-3 text-sm">{note.ai_check.reason}</p>}
    </div>
  );
}

/** Share a note: typed, from my files, or an image; checked by AI before anyone sees it. */
function ShareForm({ onDone }: { onDone: (msg: string) => void }) {
  const t = useTranslations("vault.community");
  const profile = useCurrentProfile();
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [unit, setUnit] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<NoteKind>("notes");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [nickname, setNickname] = useState(profile.nickname ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
  const units = enrollment ? unitsFor(profile.packId, enrollment.subjectId) : [];

  useEffect(() => {
    getRepo()
      .files.list()
      .then((f) => setFiles(f.filter((x) => x.status === "ready").map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, []);

  const submit = async () => {
    setError("");
    if (title.trim().length < 3) return setError(t("needTitle"));
    if (body.trim().length < 40 && !image) return setError(t("needBody"));
    if (!nickname.trim()) return setError(t("needNickname"));
    setBusy(true);
    try {
      const repo = getRepo6();
      const image_path = image ? await repo.images.upload(image, "notes") : null;
      const note = await repo.notes.create({
        author_name: nickname.trim().slice(0, 30),
        curriculum: profile.packId ?? "custom",
        subject_code: subject,
        subject_name: enrollment?.name ?? subject,
        unit: unit.trim(),
        title: title.trim().slice(0, 140),
        kind,
        body: body.trim(),
        image_path,
      });
      const res = await fetch("/api/community/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(repo.mode === "live" ? { noteId: note.id } : { note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        onDone(t("checkLater"));
        return;
      }
      const verdict = json.check?.verdict as "approve" | "hold" | "reject" | undefined;
      // Demo mode has no server-side approval, so this browser plays that part.
      if (repo.mode === "demo") await repo.notes.update(note.id, { status: verdict === "approve" ? "approved" : verdict === "reject" ? "rejected" : "pending", ai_check: json.check });
      if (verdict === "approve" && (json.status ?? "approved") === "approved") await awardXp("community", 25, note.id);
      onDone(verdict === "approve" && (json.status ?? "approved") === "approved" ? t("published") : verdict === "reject" ? `${t("notAccepted")} ${json.check?.reason ?? ""}` : t("held"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("shareIntro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("subject")} htmlFor="share-subject">
          <Select id="share-subject" value={subject} onChange={(e) => { setSubject(e.target.value); setUnit(""); }}>
            {profile.enrollments.map((e) => (
              <option key={e.subjectId} value={e.subjectId}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("unit")} htmlFor="share-unit">
          {units.length ? (
            <Select id="share-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">—</option>
              {units.map((u) => (
                <option key={u.name}>{u.name}</option>
              ))}
            </Select>
          ) : (
            <Input id="share-unit" value={unit} onChange={(e) => setUnit(e.target.value)} dir="auto" />
          )}
        </Field>
        <Field label={t("title")} htmlFor="share-title">
          <Input id="share-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} dir="auto" />
        </Field>
        <Field label={t("kind")} htmlFor="share-kind">
          <Select id="share-kind" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t("body")} htmlFor="share-body" hint={t("bodyHint")}>
        <textarea
          id="share-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          dir="auto"
          className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {files.length > 0 && (
          <Select
            className="h-9 w-auto"
            aria-label={t("fromFiles")}
            value=""
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              const pages = await getRepo().chunks.pages(id);
              setBody(pages.map((p) => p.content).join("\n\n").slice(0, 20000));
              if (!title) setTitle(files.find((f) => f.id === id)?.name.replace(/\.[^.]+$/, "") ?? "");
            }}
          >
            <option value="">{t("fromFiles")}</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-border px-3 py-1.5 font-medium hover:bg-surface-2">
          <ImagePlus className="size-4" aria-hidden />
          {image ? image.name : t("addImage")}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      <Field label={t("nickname")} htmlFor="share-nick" hint={t("nicknameHint")}>
        <Input id="share-nick" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} dir="auto" />
      </Field>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <Button onClick={submit} disabled={busy} className="self-start">
        {busy ? <Loader2 className="animate-spin" /> : <Upload aria-hidden />}
        {busy ? t("checking") : t("share")}
      </Button>
    </div>
  );
}

/** Community vault (section 9.2). */
export function CommunityVault() {
  const t = useTranslations("vault.community");
  const locale = useLocale();
  const profile = useCurrentProfile();
  const [subject, setSubject] = useState(profile.enrollments[0]?.subjectId ?? "");
  const [unit, setUnit] = useState("");
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState<CommunityNote[] | null>(null);
  const [mine, setMine] = useState<CommunityNote[]>([]);
  const [open, setOpen] = useState<CommunityNote | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState("");
  const [merged, setMerged] = useState<{ text: string | null; sources: CommunityNote[] } | null>(null);
  const [me, setMe] = useState("");

  const load = useCallback(() => {
    const repo = getRepo6();
    repo.userId().then(setMe).catch(() => {});
    repo.notes.browse({ curriculum: profile.packId, subject, unit: unit || undefined, kind: kind || undefined }).then(setNotes).catch(() => setNotes([]));
    repo.notes.mine().then(setMine).catch(() => {});
  }, [profile.packId, subject, unit, kind]);
  useEffect(() => {
    load();
  }, [load]);

  // "Merge the top 3": the three best-rated notes of one unit (needs 2+).
  const byUnit = useMemo(() => {
    const m = new Map<string, CommunityNote[]>();
    for (const n of notes ?? []) if (n.unit && n.body) m.set(n.unit, [...(m.get(n.unit) ?? []), n]);
    return [...m.entries()].filter(([, list]) => list.length >= 2);
  }, [notes]);

  const merge = async (list: CommunityNote[]) => {
    const top = [...list].sort((a, b) => b.rating_avg - a.rating_avg).slice(0, 3);
    setMerged({ text: null, sources: top });
    const res = await fetch("/api/community/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit: top[0].unit, notes: top.map((n) => ({ title: n.title, body: n.body })) }) });
    const json = await res.json().catch(() => ({}));
    setMerged({ text: res.ok ? json.text : `⚠️ ${json.message ?? t("failed")}`, sources: top });
  };

  const enrollment = profile.enrollments.find((e) => e.subjectId === subject);
  const statusLabel = (n: CommunityNote) => t(`status.${n.status}`);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("subject")} htmlFor="cv-subject">
          <Select id="cv-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {profile.enrollments.map((e) => (
              <option key={e.subjectId} value={e.subjectId}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("unit")} htmlFor="cv-unit">
          <Input id="cv-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t("anyUnit")} dir="auto" />
        </Field>
        <Field label={t("kind")} htmlFor="cv-kind">
          <Select id="cv-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">{t("allKinds")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="ms-auto" onClick={() => setSharing(true)}>
          <Plus aria-hidden />
          {t("shareButton")}
        </Button>
      </div>

      {toast && (
        <p className="rounded-[10px] bg-primary-soft p-3 text-sm" role="status">
          {toast}
        </p>
      )}

      {byUnit.map(([u, list]) => (
        <Card key={u} className="flex flex-wrap items-center gap-3 border-primary/30 p-3">
          <Sparkles className="size-5 text-primary" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium" dir="auto">{u}</span> · {t("mergeText", { count: Math.min(3, list.length) })}
          </p>
          <Button size="sm" variant="outline" onClick={() => merge(list)}>
            <Merge aria-hidden />
            {t("merge")}
          </Button>
        </Card>
      ))}

      {notes === null ? (
        <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-surface-2" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<Upload className="size-8" />} title={t("empty", { subject: enrollment?.name ?? "" })} text={t("emptyText")} />
      ) : (
        <ul className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
          {notes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setOpen(n)} className="flex w-full flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-start transition hover:border-primary">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip color={subjectColor(profile.enrollments.find((e) => e.subjectId === n.subject_code)?.color ?? 0)}>{t(`kinds.${n.kind}`)}</Chip>
                  <Badges n={n} />
                </div>
                <span className="font-semibold" dir="auto">
                  {n.title}
                </span>
                <span className="text-sm text-muted" dir="auto">
                  {n.unit || n.subject_name} · {n.author_name} · {fmt(n.created_at)}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <Stars value={n.rating_avg} />
                  <span className="text-muted">{n.rating_count ? `${n.rating_avg.toFixed(1)} (${n.rating_count})` : t("noRatings")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mine.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">{t("mine")}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {mine.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setOpen(n)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-start hover:bg-surface-2">
                  <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                    {n.title}
                  </span>
                  <Chip className={cn(n.status === "approved" && "border-success/50 text-success", n.status === "rejected" && "border-danger/50 text-danger")}>{statusLabel(n)}</Chip>
                  {n.status === "approved" && <Stars value={n.rating_avg} />}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t("pointsNote")}</p>
        </section>
      )}

      <Drawer open={sharing} onClose={() => setSharing(false)} title={t("shareTitle")} closeLabel={t("close")} wide>
        <ShareForm
          onDone={(msg) => {
            setSharing(false);
            setToast(msg);
            load();
          }}
        />
      </Drawer>
      <Drawer open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? ""} closeLabel={t("close")} wide>
        {open && <NoteView note={open} mine={open.user_id === me} onChanged={load} />}
      </Drawer>
      <Drawer open={merged !== null} onClose={() => setMerged(null)} title={t("mergedTitle")} closeLabel={t("close")} wide>
        {merged && (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-1 text-sm text-muted">
              {merged.sources.map((s, i) => (
                <li key={s.id}>
                  [{i + 1}] <span dir="auto">{s.title}</span> · {s.author_name}
                </li>
              ))}
            </ol>
            {merged.text ? <Markdown content={merged.text} citations={merged.sources.map((s, i) => ({ n: i + 1, file_id: null, file_name: s.title, page: null }))} /> : <Loader2 className="size-5 animate-spin text-muted" />}
          </div>
        )}
      </Drawer>
    </div>
  );
}
