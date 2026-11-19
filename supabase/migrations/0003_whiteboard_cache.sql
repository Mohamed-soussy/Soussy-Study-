-- Soussy Study: shared whiteboard lessons (section 1A, "make once, share with everyone").
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run more than once.
-- Lessons are public syllabus content. Every signed-in student can read them; only the
-- server (with the service-role key, never in the browser) can add them, so nobody can
-- plant a fake lesson.

create table if not exists public.whiteboard_lessons (
  key text primary key,               -- language|level|normalized topic
  title text not null,
  language text not null,
  lesson jsonb not null,
  plays integer not null default 0,
  created_at timestamptz not null default now(),
  last_played_at timestamptz not null default now()
);

alter table public.whiteboard_lessons enable row level security;
drop policy if exists "read lessons" on public.whiteboard_lessons;
create policy "read lessons" on public.whiteboard_lessons for select to authenticated using (true);
grant select on public.whiteboard_lessons to authenticated;

-- Play counter (server only).
create or replace function public.touch_whiteboard_lesson(k text)
returns void language sql volatile security definer set search_path = public as $$
  update public.whiteboard_lessons set plays = plays + 1, last_played_at = now() where key = k;
$$;
revoke all on function public.touch_whiteboard_lesson(text) from public, anon, authenticated;
