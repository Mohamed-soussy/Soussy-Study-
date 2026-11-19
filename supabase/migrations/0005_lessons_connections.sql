-- Soussy Study, Phase 5: lesson recording analyzer (section 11) and school connections,
-- Levels 1 and 2 (section 10). Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once.

/* ---------- calendar items that came from school ---------- */

-- external_id: the item's id in the other system (an .ics UID or a Teams assignment id),
--   so a re-sync updates the item instead of adding a copy.
-- origins: every place this item was heard or seen, e.g. a lesson at 34:12 and Teams.
--   One item with two origins is how duplicates are merged (section 10.4).
-- conflict_of: a found item whose due date differs from an item already saved.
alter table public.events add column if not exists external_id text;
alter table public.events add column if not exists origins jsonb not null default '[]';
alter table public.events add column if not exists conflict_of uuid references public.events (id) on delete cascade;
create unique index if not exists events_external_idx on public.events (user_id, external_id) where external_id is not null;

/* ---------- lessons (section 11) ---------- */

-- The recording itself stays on the device it was added from (it can be hours of video);
-- only the transcript and what was found in it are stored here. Private to the student.
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  subject_code text,
  lesson_date date not null,
  media_name text,
  media_kind text check (media_kind in ('video', 'audio', 'transcript')),
  duration_s integer,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error text,
  transcript jsonb not null default '[]',   -- [{ s, e, text, speaker? }] seconds
  chapters jsonb not null default '[]',     -- [{ at, title }]
  slides jsonb not null default '[]',       -- [{ at, text }] text read from the screen
  items jsonb not null default '[]',        -- what the analyzer found, with quote + time
  key_points jsonb not null default '[]',
  summary text,
  missed text,                              -- "What I missed" brief, made on request
  created_at timestamptz not null default now()
);
create index if not exists lessons_user_idx on public.lessons (user_id, lesson_date desc);

/* ---------- school connections (section 10) ---------- */

-- What the student sees in Settings → Connections. No secrets in this table.
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (provider in ('ics', 'microsoft')),
  label text not null default '',
  url text,                                 -- .ics feeds only
  account text,                             -- e.g. the Microsoft account's email
  settings jsonb not null default '{}',     -- toggles per type and per class
  last_sync timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists connections_ms_idx on public.connections (user_id, provider) where provider = 'microsoft';

-- Microsoft sign-in tokens, encrypted (AES-256-GCM) by the server before they are stored.
-- Row-level security is on with NO policies, so students' browsers can never read this
-- table; only the server, with the service role key, can.
create table if not exists public.connection_secrets (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('microsoft')),
  sealed text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.connection_secrets enable row level security;
revoke all on public.connection_secrets from anon, authenticated;

/* ---------- row-level security ---------- */

do $$
declare t text;
begin
  foreach t in array array['lessons', 'connections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
