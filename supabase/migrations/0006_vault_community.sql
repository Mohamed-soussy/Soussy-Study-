-- Soussy Study, Phase 6: resource finder (section 9.1), community vault (9.2), reports and
-- moderation (section 14), and server-side school sync for Teams Level 3 (section 10).
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run more than once.

/* ---------- roles and public names ---------- */

-- role: 'student' (default), 'teacher' (can verify notes, post to classes), 'moderator'
-- (review queue). Only the service role or an existing moderator can change a role.
alter table public.profiles add column if not exists role text not null default 'student';
alter table public.profiles add column if not exists nickname text;
do $$ begin
  alter table public.profiles add constraint profiles_role_check check (role in ('student', 'teacher', 'moderator'));
exception when duplicate_object then null; end $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'student')
$$;
create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() = 'moderator' $$;
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() in ('teacher', 'moderator') $$;

-- Students can't promote themselves.
create or replace function public.guard_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' and not public.is_moderator() then
    new.role := old.role;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update of role on public.profiles for each row execute function public.guard_role();

/* ---------- resource finder: saved links (9.1) ---------- */

create table if not exists public.saved_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  title text not null,
  source text,
  kind text,
  summary text,
  notes text,
  subject_code text,
  unit text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);

/* ---------- community vault (9.2) ---------- */

create table if not exists public.community_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default 'Student',  -- nickname only, never a real name by default
  curriculum text not null,                     -- 'ib-dp', 'american-hs', ...
  subject_code text not null,
  subject_name text not null,
  unit text not null default '',
  title text not null check (char_length(title) between 3 and 140),
  kind text not null check (kind in ('notes', 'cheat_sheet', 'mind_map', 'flashcards', 'traps')),
  body text not null default '' check (char_length(body) <= 60000),
  image_path text,                              -- mind maps and cheat sheets as images
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  ai_check jsonb,                               -- what the AI check found, shown to moderators
  teacher_approved boolean not null default false,
  grade_badge text check (grade_badge in ('7', '6', '5', '4', 'A', 'B')),
  rating_avg real not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_notes_browse_idx on public.community_notes (curriculum, subject_code, unit, status);

-- Only approved notes are visible to others; your own are always visible to you.
alter table public.community_notes enable row level security;
drop policy if exists "read approved" on public.community_notes;
create policy "read approved" on public.community_notes for select to authenticated
  using (status = 'approved' or user_id = auth.uid() or public.is_teacher());
drop policy if exists "write own" on public.community_notes;
create policy "write own" on public.community_notes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "update own or moderate" on public.community_notes;
create policy "update own or moderate" on public.community_notes for update to authenticated
  using (user_id = auth.uid() or public.is_teacher()) with check (user_id = auth.uid() or public.is_teacher());
drop policy if exists "delete own or moderate" on public.community_notes;
create policy "delete own or moderate" on public.community_notes for delete to authenticated using (user_id = auth.uid() or public.is_moderator());
grant select, insert, update, delete on public.community_notes to authenticated;

-- Students may not set their own badges or status: only teachers/moderators.
create or replace function public.guard_note() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_moderator() or current_setting('soussy.system', true) = 'on' then return new; end if;
  -- The rating trigger below updates only the average and count.
  if tg_op = 'UPDATE' and current_setting('soussy.rating', true) = 'on' then
    new := old; new.rating_avg := (select coalesce(avg(stars), 0) from public.note_ratings where note_id = old.id);
    new.rating_count := (select count(*) from public.note_ratings where note_id = old.id);
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.teacher_approved := false; new.grade_badge := null; new.rating_avg := 0; new.rating_count := 0;
  else
    if not public.is_teacher() then
      new.teacher_approved := old.teacher_approved;
    end if;
    new.grade_badge := old.grade_badge;
    new.rating_avg := old.rating_avg; new.rating_count := old.rating_count;
    -- An edit sends the note back for a check; only the AI check route (service role) approves.
    if new.body is distinct from old.body or new.title is distinct from old.title then new.status := 'pending'; else new.status := old.status; end if;
  end if;
  return new;
end $$;
drop trigger if exists community_notes_guard on public.community_notes;
create trigger community_notes_guard before insert or update on public.community_notes for each row execute function public.guard_note();

create table if not exists public.note_ratings (
  note_id uuid not null references public.community_notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
alter table public.note_ratings enable row level security;
drop policy if exists "own ratings" on public.note_ratings;
create policy "own ratings" on public.note_ratings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.note_ratings to authenticated;

-- Keeps the average up to date (and, below, stops students rating their own notes).
create or replace function public.rate_note() returns trigger language plpgsql security definer set search_path = public as $$
declare nid uuid := coalesce(new.note_id, old.note_id);
begin
  perform set_config('soussy.rating', 'on', true);
  update community_notes set
    rating_avg = coalesce((select avg(stars) from note_ratings where note_id = nid), 0),
    rating_count = (select count(*) from note_ratings where note_id = nid)
  where id = nid;
  perform set_config('soussy.rating', 'off', true);
  return null;
end $$;
drop trigger if exists note_ratings_after on public.note_ratings;
create trigger note_ratings_after after insert or update or delete on public.note_ratings for each row execute function public.rate_note();
drop trigger if exists note_ratings_before on public.note_ratings;
create or replace function public.rate_note_check() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from community_notes where id = new.note_id and user_id = new.user_id) then
    raise exception 'You can''t rate your own note.';
  end if;
  return new;
end $$;
create trigger note_ratings_before before insert or update on public.note_ratings for each row execute function public.rate_note_check();

-- "Scored 7": proven by a result screenshot a moderator reviews; never self-declared.
create table if not exists public.grade_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_id uuid not null references public.community_notes (id) on delete cascade,
  grade text not null check (grade in ('7', '6', '5', '4', 'A', 'B')),
  image_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.grade_proofs enable row level security;
drop policy if exists "own or moderator" on public.grade_proofs;
create policy "own or moderator" on public.grade_proofs for select to authenticated using (user_id = auth.uid() or public.is_moderator());
drop policy if exists "insert own" on public.grade_proofs;
create policy "insert own" on public.grade_proofs for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "moderate" on public.grade_proofs;
create policy "moderate" on public.grade_proofs for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
grant select, insert, update on public.grade_proofs to authenticated;

/* ---------- reports and the moderation queue (section 14) ---------- */

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('note', 'room', 'squad_message', 'user')),
  target_id text not null,
  target_user uuid references auth.users (id) on delete set null,
  reason text not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_kind, target_id)
);
alter table public.reports enable row level security;
drop policy if exists "file a report" on public.reports;
create policy "file a report" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists "see own or moderate" on public.reports;
create policy "see own or moderate" on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());
drop policy if exists "moderate reports" on public.reports;
create policy "moderate reports" on public.reports for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
grant select, insert, update on public.reports to authenticated;

-- Two reports from different students hide a note until a moderator looks at it.
create or replace function public.auto_hide() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_kind = 'note' and (select count(distinct reporter_id) from reports where target_kind = 'note' and target_id = new.target_id and status = 'open') >= 2 then
    perform set_config('soussy.system', 'on', true);
    update community_notes set status = 'pending' where id::text = new.target_id and status = 'approved';
    perform set_config('soussy.system', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists reports_auto_hide on public.reports;
create trigger reports_auto_hide after insert on public.reports for each row execute function public.auto_hide();

/* ---------- storage: images for community notes and grade proofs ---------- */

insert into storage.buckets (id, name, public) values ('community', 'community', false) on conflict (id) do nothing;
drop policy if exists "community upload own" on storage.objects;
create policy "community upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "community read" on storage.objects;
-- Grade proofs live under <user>/proofs/ and are readable only by their owner and moderators.
create policy "community read" on storage.objects for select to authenticated
  using (bucket_id = 'community' and ((storage.foldername(name))[2] <> 'proofs' or (storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));
drop policy if exists "community delete own" on storage.objects;
create policy "community delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);

/* ---------- Teams Level 3: background sync (section 10, school-approved app) ---------- */

-- Remember what was already imported from meeting transcripts.
alter table public.lessons add column if not exists external_id text;
create unique index if not exists lessons_external_idx on public.lessons (user_id, external_id) where external_id is not null;

-- Every 30 minutes Supabase calls the app's sync route (needs the pg_cron and pg_net
-- extensions: Database → Extensions). Replace the two values in <> before running this
-- part, or skip it until the school approves Level 3.
-- select cron.schedule('soussy-school-sync', '*/30 * * * *', $$
--   select net.http_post(
--     url := 'https://<your-site>/api/cron/school-sync',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   )
-- $$);
