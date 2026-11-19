import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";
import type { Lesson } from "./types";

/**
 * Shared cache of whiteboard lessons (section 1A, "make once, share with everyone").
 * - Always: an in-memory cache on this server.
 * - When SUPABASE_SERVICE_ROLE_KEY is set (server only): the `whiteboard_lessons`
 *   table, so every server and every student shares one copy. Students can read
 *   it but can't write to it, so nobody can plant a fake lesson.
 */
const memory = new Map<string, Lesson>();

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export async function getSharedLesson(key: string): Promise<Lesson | null> {
  const hit = memory.get(key);
  if (hit) return hit;
  const sb = admin();
  if (!sb) return null;
  const { data } = await sb.from("whiteboard_lessons").select("lesson").eq("key", key).maybeSingle();
  if (data?.lesson) {
    memory.set(key, data.lesson as Lesson);
    sb.rpc("touch_whiteboard_lesson", { k: key }).then(() => {});
    return data.lesson as Lesson;
  }
  return null;
}

export async function putSharedLesson(key: string, lesson: Lesson): Promise<void> {
  memory.set(key, lesson);
  if (memory.size > 500) memory.delete(memory.keys().next().value!);
  const sb = admin();
  if (!sb) return;
  await sb.from("whiteboard_lessons").upsert({ key, lesson, language: lesson.language, title: lesson.title });
}
