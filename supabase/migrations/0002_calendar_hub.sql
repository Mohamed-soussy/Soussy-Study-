-- Soussy Study, Phase 2: calendar, Study Hub vault, chat.
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run more than once.

-- New Supabase projects don't grant table access to signed-in users automatically.
grant select, insert, update, delete on public.profiles, public.enrollments to authenticated;

-- Private calendar feed token (section 5, "Sync out").
alter table public.profiles add column if not exists ics_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_ics_token_idx on public.profiles (ics_token);

create extension if not exists vector with schema extensions; -- pgvector, for embeddings in a later phase

/* ---------- calendar ---------- */

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  type text not null check (type in ('test', 'homework', 'submission', 'event', 'class', 'personal')),
  subject_code text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default true,
  description text,
  location text,
  dress_code text,
  estimated_minutes integer,
  -- where it came from: typed by the student, imported, or found by AI
  source text not null default 'manual' check (source in ('manual', 'teams', 'platform', 'lesson', 'ai', 'file')),
  confidence real,                       -- for AI-found items, 0–1
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  in_review boolean not null default false, -- AI-found items wait in the Review tray
  reminders integer[] not null default '{4320,1440,0}', -- minutes before: 3 days, 1 day, morning of
  parent_id uuid references public.events (id) on delete cascade, -- milestones and study-sprint tasks
  repeat_every_days integer check (repeat_every_days between 1 and 28), -- 7 = weekly, 6 = 6-day rotation
  repeat_until date,
  linked_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_user_time_idx on public.events (user_id, starts_at);

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

/* ---------- vault ---------- */

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  subject_code text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists folders_user_idx on public.folders (user_id);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete set null,
  name text not null,
  mime text not null,
  size_bytes bigint not null default 0,
  storage_path text not null unique,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'error')),
  error text,
  summary text,
  subject_code text,
  unit text,
  topic text,
  key_terms text[] not null default '{}',
  page_count integer,
  created_at timestamptz not null default now()
);
create index if not exists files_user_idx on public.files (user_id, created_at desc);

-- Text of each page, for "search inside files" and for answers that cite file + page.
create table if not exists public.file_chunks (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page integer not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding extensions.vector(1024)
);
create index if not exists file_chunks_tsv_idx on public.file_chunks using gin (tsv);
create index if not exists file_chunks_file_idx on public.file_chunks (file_id, page);

-- Highlights and comments in the file viewer.
create table if not exists public.file_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  page integer not null,
  quote text,
  note text,
  color text not null default 'yellow',
  created_at timestamptz not null default now()
);

/* ---------- chat ---------- */

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  subject_code text,
  source_file_ids uuid[] not null default '{}',
  source_urls text[] not null default '{}',
  sources_answered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chats_user_idx on public.chats (user_id, updated_at desc);

drop trigger if exists chats_touch on public.chats;
create trigger chats_touch before update on public.chats
  for each row execute function public.touch_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists messages_chat_idx on public.messages (chat_id, created_at);

-- Daily AI allowance (section 1A): counts new AI generations per student per day.
create table if not exists public.ai_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);

/* ---------- row-level security ---------- */

do $$
declare t text;
begin
  foreach t in array array['events', 'folders', 'files', 'file_chunks', 'file_notes', 'chats', 'messages', 'ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;

/* ---------- functions ---------- */

-- Search inside the student's files. Any word may match; best matches first.
create or replace function public.search_chunks(q text, only_files uuid[] default null, match_count int default 8)
returns table (file_id uuid, file_name text, page int, content text, rank real)
language sql stable security invoker set search_path = public as $$
  with query as (
    select to_tsquery('simple', string_agg(quote_literal(lexeme) || ':*', ' | ')) as tsq
    from unnest(to_tsvector('simple', q)) as l(lexeme, positions, weights)
    where length(lexeme) > 2
  )
  select c.file_id, f.name, c.page, c.content, ts_rank_cd(c.tsv, query.tsq) as rank
  from public.file_chunks c
  join public.files f on f.id = c.file_id
  cross join query
  where query.tsq is not null
    and c.tsv @@ query.tsq
    and (only_files is null or c.file_id = any (only_files))
  order by rank desc
  limit match_count;
$$;
grant execute on function public.search_chunks(text, uuid[], int) to authenticated;

-- Adds one to today's AI count and returns the new total.
create or replace function public.bump_ai_usage()
returns integer
language sql volatile security invoker set search_path = public as $$
  insert into public.ai_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;
grant execute on function public.bump_ai_usage() to authenticated;

-- Private .ics feed: the token in the link is the only key, so calendar apps can subscribe.
create or replace function public.ics_feed(token uuid)
returns setof public.events
language sql stable security definer set search_path = public as $$
  select e.* from public.events e
  join public.profiles p on p.id = e.user_id
  where p.ics_token = token and e.in_review = false;
$$;
revoke all on function public.ics_feed(uuid) from public;
grant execute on function public.ics_feed(uuid) to anon, authenticated;

/* ---------- file storage ---------- */

insert into storage.buckets (id, name, public, file_size_limit)
values ('vault', 'vault', false, 26214400) -- 25 MB per file
on conflict (id) do nothing;

-- Files live under vault/<user id>/..., and only that student can touch them.
drop policy if exists "vault own files" on storage.objects;
create policy "vault own files" on storage.objects for all to authenticated
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
