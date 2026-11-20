"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBlob, putBlob } from "@/lib/data/idb";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { check, table } from "./repo";

/**
 * Phase 6 data: saved resources, the community vault, ratings, reports and the moderation
 * queue (migration 0006). Supabase when signed in, this browser in demo mode.
 */

export interface SavedResource {
  id: string;
  url: string;
  title: string;
  source: string | null;
  kind: string | null;
  summary: string | null;
  notes: string | null;
  subject_code: string | null;
  unit: string | null;
  created_at: string;
}

export type NoteKind = "notes" | "cheat_sheet" | "mind_map" | "flashcards" | "traps";
export type NoteStatus = "pending" | "approved" | "rejected" | "removed";

export interface CommunityNote {
  id: string;
  user_id: string;
  author_name: string;
  curriculum: string;
  subject_code: string;
  subject_name: string;
  unit: string;
  title: string;
  kind: NoteKind;
  body: string;
  image_path: string | null;
  status: NoteStatus;
  ai_check: AiCheck | null;
  teacher_approved: boolean;
  grade_badge: string | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}

/** What the AI check found (section 9.2): on-topic, readable, no copied material, no personal data. */
export interface AiCheck {
  verdict: "approve" | "hold" | "reject";
  on_topic: boolean;
  readable: boolean;
  copied_material: boolean;
  personal_data: boolean;
  unsafe: boolean;
  reason: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_kind: "note" | "room" | "squad_message" | "user";
  target_id: string;
  target_user: string | null;
  reason: string;
  details: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
}

export interface GradeProof {
  id: string;
  user_id: string;
  note_id: string;
  grade: string;
  image_path: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export type NewNote = Pick<CommunityNote, "author_name" | "curriculum" | "subject_code" | "subject_name" | "unit" | "title" | "kind" | "body" | "image_path">;

export interface Repo6 {
  mode: "live" | "demo";
  userId(): Promise<string>;
  saved: {
    list(): Promise<SavedResource[]>;
    add(r: Omit<SavedResource, "id" | "created_at">): Promise<void>;
    update(id: string, patch: Partial<SavedResource>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  notes: {
    /** Approved notes (plus your own), filtered. */
    browse(f: { curriculum?: string; subject?: string; unit?: string; kind?: string }): Promise<CommunityNote[]>;
    mine(): Promise<CommunityNote[]>;
    get(id: string): Promise<CommunityNote | null>;
    create(n: NewNote): Promise<CommunityNote>;
    update(id: string, patch: Partial<CommunityNote>): Promise<void>;
    remove(id: string): Promise<void>;
    myRating(id: string): Promise<number | null>;
    rate(id: string, stars: number): Promise<void>;
  };
  images: {
    upload(file: Blob, folder: "notes" | "proofs"): Promise<string>;
    url(path: string): Promise<string | null>;
  };
  reports: {
    create(r: Pick<Report, "target_kind" | "target_id" | "reason" | "details"> & { target_user?: string | null }): Promise<void>;
    open(): Promise<Report[]>;
    resolve(id: string, status: "actioned" | "dismissed"): Promise<void>;
  };
  proofs: {
    create(p: Pick<GradeProof, "note_id" | "grade" | "image_path">): Promise<void>;
    pending(): Promise<GradeProof[]>;
    decide(p: GradeProof, approve: boolean): Promise<void>;
  };
  queue(): Promise<CommunityNote[]>;
}

const now = () => new Date().toISOString();

function live(sb: SupabaseClient): Repo6 {
  const uid = async () => (await sb.auth.getUser()).data.user?.id ?? "";
  return {
    mode: "live",
    userId: uid,
    saved: {
      list: async () => check(await sb.from("saved_resources").select("*").order("created_at", { ascending: false })) as SavedResource[],
      add: async (r) => void check(await sb.from("saved_resources").upsert(r, { onConflict: "user_id,url" })),
      update: async (id, patch) => void check(await sb.from("saved_resources").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("saved_resources").delete().eq("id", id)),
    },
    notes: {
      browse: async (f) => {
        let q = sb.from("community_notes").select("*").eq("status", "approved");
        if (f.curriculum) q = q.eq("curriculum", f.curriculum);
        if (f.subject) q = q.eq("subject_code", f.subject);
        if (f.unit) q = q.ilike("unit", `%${f.unit}%`);
        if (f.kind) q = q.eq("kind", f.kind);
        return check(await q.order("rating_avg", { ascending: false }).order("created_at", { ascending: false }).limit(100)) as CommunityNote[];
      },
      mine: async () => check(await sb.from("community_notes").select("*").eq("user_id", await uid()).order("created_at", { ascending: false })) as CommunityNote[],
      get: async (id) => check(await sb.from("community_notes").select("*").eq("id", id).maybeSingle()) as CommunityNote | null,
      create: async (n) => check(await sb.from("community_notes").insert(n).select().single()) as CommunityNote,
      update: async (id, patch) => void check(await sb.from("community_notes").update(patch).eq("id", id)),
      remove: async (id) => void check(await sb.from("community_notes").delete().eq("id", id)),
      myRating: async (id) => ((check(await sb.from("note_ratings").select("stars").eq("note_id", id).eq("user_id", await uid()).maybeSingle()) as { stars: number } | null)?.stars ?? null),
      rate: async (id, stars) => void check(await sb.from("note_ratings").upsert({ note_id: id, stars }, { onConflict: "note_id,user_id" })),
    },
    images: {
      upload: async (file, folder) => {
        const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg").slice(0, 5);
        const path = `${await uid()}/${folder}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("community").upload(path, file, { contentType: file.type || "image/png" });
        if (error) throw error;
        return path;
      },
      url: async (path) => (await sb.storage.from("community").createSignedUrl(path, 3600)).data?.signedUrl ?? null,
    },
    reports: {
      create: async (r) => {
        const { error } = await sb.from("reports").insert(r);
        // Reporting the same thing twice is fine: the first report stands.
        if (error && !/duplicate/i.test(error.message)) throw error;
      },
      open: async () => check(await sb.from("reports").select("*").eq("status", "open").order("created_at")) as Report[],
      resolve: async (id, status) => void check(await sb.from("reports").update({ status }).eq("id", id)),
    },
    proofs: {
      create: async (p) => void check(await sb.from("grade_proofs").insert(p)),
      pending: async () => check(await sb.from("grade_proofs").select("*").eq("status", "pending").order("created_at")) as GradeProof[],
      decide: async (p, approve) => {
        check(await sb.from("grade_proofs").update({ status: approve ? "approved" : "rejected" }).eq("id", p.id));
        if (approve) check(await sb.from("community_notes").update({ grade_badge: p.grade }).eq("id", p.note_id));
      },
    },
    queue: async () => check(await sb.from("community_notes").select("*").eq("status", "pending").order("created_at")) as CommunityNote[],
  };
}

/* ---------- demo: one browser, so "the community" is you plus sample notes ---------- */

const DEMO_USER = "demo-user";
const SAMPLES: CommunityNote[] = [
  {
    id: "sample-1",
    user_id: "sample-author-1",
    author_name: "Lina (demo)",
    curriculum: "ib-dp",
    subject_code: "phys",
    subject_name: "Physics",
    unit: "Electromagnetic induction",
    title: "Lenz's law: the 4 traps that cost me marks",
    kind: "traps",
    body: "1. **The minus sign is Lenz's law**, not a calculation step: always state the induced current *opposes the change* in flux.\n2. Holding a magnet still inside a coil induces **nothing**: no change in flux.\n3. Doubling rotation speed doubles **both** peak emf and frequency.\n4. Flux linkage is $N\\Phi$: forgetting $N$ is the most common slip.",
    image_path: null,
    status: "approved",
    ai_check: null,
    teacher_approved: true,
    grade_badge: "7",
    rating_avg: 4.8,
    rating_count: 12,
    created_at: "2026-10-02T10:00:00Z",
  },
  {
    id: "sample-2",
    user_id: "sample-author-2",
    author_name: "Omar (demo)",
    curriculum: "ib-dp",
    subject_code: "phys",
    subject_name: "Physics",
    unit: "Electromagnetic induction",
    title: "Faraday's law cheat sheet",
    kind: "cheat_sheet",
    body: "- $\\varepsilon = -N\\dfrac{\\Delta\\Phi}{\\Delta t}$\n- $\\Phi = BA\\cos\\theta$ (weber, Wb)\n- Moving rod: $\\varepsilon = BLv$\n- AC generator peak: $\\varepsilon_0 = NBA\\omega$\n- Transformer: $\\dfrac{V_s}{V_p} = \\dfrac{N_s}{N_p}$, ideal $P_{in}=P_{out}$",
    image_path: null,
    status: "approved",
    ai_check: null,
    teacher_approved: false,
    grade_badge: null,
    rating_avg: 4.5,
    rating_count: 8,
    created_at: "2026-10-10T10:00:00Z",
  },
  {
    id: "sample-3",
    user_id: "sample-author-3",
    author_name: "Maya (demo)",
    curriculum: "ib-dp",
    subject_code: "phys",
    subject_name: "Physics",
    unit: "Electromagnetic induction",
    title: "Transformers and power lines, explained simply",
    kind: "notes",
    body: "A transformer only works with **alternating** current: the changing flux in the iron core induces an emf in the secondary.\n\nStep-up → higher voltage, **lower current** (power is conserved in an ideal transformer). Power lines use high voltage because the energy lost as heat is $P = I^2R$: a smaller current loses far less.\n\nCores are **laminated** to cut eddy currents.",
    image_path: null,
    status: "approved",
    ai_check: null,
    teacher_approved: false,
    grade_badge: null,
    rating_avg: 4.2,
    rating_count: 5,
    created_at: "2026-10-15T10:00:00Z",
  },
];

function demo(): Repo6 {
  const saved = table<SavedResource>("saved_resources");
  const notes = table<CommunityNote>("community_notes");
  const ratings = table<{ id: string; note_id: string; stars: number }>("note_ratings");
  const reports = table<Report>("reports");
  const proofs = table<GradeProof>("grade_proofs");
  const all = () => [...notes.all(), ...SAMPLES.filter((s) => !notes.all().some((n) => n.id === s.id))];
  return {
    mode: "demo",
    userId: async () => DEMO_USER,
    saved: {
      list: async () => saved.all().sort((a, b) => b.created_at.localeCompare(a.created_at)),
      add: async (r) => {
        if (saved.all().some((x) => x.url === r.url)) return;
        saved.insert({ ...r, id: crypto.randomUUID(), created_at: now() });
      },
      update: async (id, patch) => saved.patch(id, patch),
      remove: async (id) => saved.remove((x) => x.id === id),
    },
    notes: {
      browse: async (f) =>
        all()
          .filter((n) => n.status === "approved")
          .filter((n) => (!f.curriculum || n.curriculum === f.curriculum) && (!f.subject || n.subject_code === f.subject) && (!f.kind || n.kind === f.kind))
          .filter((n) => !f.unit || n.unit.toLowerCase().includes(f.unit.toLowerCase()))
          .sort((a, b) => b.rating_avg - a.rating_avg || b.created_at.localeCompare(a.created_at)),
      mine: async () => notes.all().filter((n) => n.user_id === DEMO_USER),
      get: async (id) => all().find((n) => n.id === id) ?? null,
      create: async (n) =>
        notes.insert({ ...n, id: crypto.randomUUID(), user_id: DEMO_USER, status: "pending", ai_check: null, teacher_approved: false, grade_badge: null, rating_avg: 0, rating_count: 0, created_at: now() }),
      update: async (id, patch) => {
        if (!notes.all().some((n) => n.id === id)) {
          const s = SAMPLES.find((x) => x.id === id);
          if (s) notes.insert({ ...s });
        }
        notes.patch(id, patch);
      },
      remove: async (id) => notes.remove((n) => n.id === id),
      myRating: async (id) => ratings.all().find((r) => r.note_id === id)?.stars ?? null,
      rate: async (id, stars) => {
        const n = all().find((x) => x.id === id);
        if (!n || n.user_id === DEMO_USER) throw new Error("You can't rate your own note.");
        const prev = ratings.all().find((r) => r.note_id === id);
        if (prev) ratings.patch(prev.id, { stars });
        else ratings.insert({ id: crypto.randomUUID(), note_id: id, stars });
        const count = n.rating_count + (prev ? 0 : 1);
        const avg = (n.rating_avg * n.rating_count - (prev?.stars ?? 0) + stars) / count;
        await demo().notes.update(id, { rating_avg: Math.round(avg * 10) / 10, rating_count: count });
      },
    },
    images: {
      upload: async (file, folder) => {
        const key = `community:${folder}:${crypto.randomUUID()}`;
        await putBlob(key, file);
        return key;
      },
      url: async (path) => {
        const b = await getBlob(path).catch(() => null);
        return b ? URL.createObjectURL(b) : null;
      },
    },
    reports: {
      create: async (r) => {
        if (reports.all().some((x) => x.target_kind === r.target_kind && x.target_id === r.target_id)) return;
        reports.insert({ target_user: null, ...r, details: r.details ?? null, id: crypto.randomUUID(), reporter_id: DEMO_USER, status: "open", created_at: now() });
      },
      open: async () => reports.all().filter((r) => r.status === "open"),
      resolve: async (id, status) => reports.patch(id, { status }),
    },
    proofs: {
      create: async (p) => void proofs.insert({ ...p, id: crypto.randomUUID(), user_id: DEMO_USER, status: "pending", created_at: now() }),
      pending: async () => proofs.all().filter((p) => p.status === "pending"),
      decide: async (p, approve) => {
        proofs.patch(p.id, { status: approve ? "approved" : "rejected" });
        if (approve) notes.patch(p.note_id, { grade_badge: p.grade });
      },
    },
    queue: async () => notes.all().filter((n) => n.status === "pending"),
  };
}

let repo: Repo6 | null = null;
export function getRepo6(): Repo6 {
  if (!repo) {
    const sb = getSupabaseBrowser();
    repo = sb ? live(sb) : demo();
  }
  return repo;
}

/** "Top-rated": 4.5+ stars from at least 3 students. */
export const isTopRated = (n: Pick<CommunityNote, "rating_avg" | "rating_count">) => n.rating_avg >= 4.5 && n.rating_count >= 3;
