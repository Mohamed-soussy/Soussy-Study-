-- Soussy Study, Phase 3: solver history and mistake log, flashcards (FSRS), linked devices,
-- per-student settings (teachers, layouts). Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once.

-- Settings that follow the student across devices: teacher choice, saved layouts, calculator model.
alter table public.profiles add column if not exists prefs jsonb not null default '{}';

/* ---------- solver ---------- */

create table if not exists public.solutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  problem text not null,
  subject text,
  topic text,
  solution jsonb not null,
  verification jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists solutions_user_idx on public.solutions (user_id, created_at desc);

-- Wrong attempts, by topic; they feed "Quiz me on weak topics" (section 8).
create table if not exists public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null default 'solver' check (source in ('solver', 'flashcards', 'quiz')),
  subject text,
  topic text,
  question text not null,
  given text,
  correct text,
  created_at timestamptz not null default now()
);
create index if not exists mistakes_user_idx on public.mistakes (user_id, created_at desc);

/* ---------- flashcards (FSRS, section 12.1) ---------- */

create table if not exists public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  subject_code text,
  source_file_id uuid references public.files (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id uuid not null references public.flashcard_decks (id) on delete cascade,
  front text not null,
  back text not null,
  -- FSRS memory state (ts-fsrs Card)
  due timestamptz not null default now(),
  stability real not null default 0,
  difficulty real not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0, -- 0 new, 1 learning, 2 review, 3 relearning
  last_review timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists flashcards_due_idx on public.flashcards (user_id, due);
create index if not exists flashcards_deck_idx on public.flashcards (deck_id);

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null references public.flashcards (id) on delete cascade,
  rating smallint not null check (rating between 1 and 4), -- 1 again, 2 hard, 3 good, 4 easy
  state smallint not null,
  due timestamptz not null,
  scheduled_days integer not null,
  reviewed_at timestamptz not null default now()
);

/* ---------- linked devices (section 4A) ---------- */

create table if not exists public.devices (
  id uuid primary key,                   -- generated on the device
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  linked boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- At most 3 linked devices per account.
create or replace function public.limit_linked_devices() returns trigger
language plpgsql as $$
begin
  if new.linked and (select count(*) from public.devices where user_id = new.user_id and linked and id <> new.id) >= 3 then
    raise exception 'You can link at most 3 devices. Unlink one first.';
  end if;
  return new;
end $$;
drop trigger if exists devices_limit on public.devices;
create trigger devices_limit before insert or update of linked on public.devices
  for each row execute function public.limit_linked_devices();

-- 6-digit codes, valid 5 minutes. Row-level security means a code can only be seen and
-- claimed by a device signed in to the SAME account, so linking never crosses accounts.
create table if not exists public.device_link_codes (
  code text primary key check (code ~ '^[0-9]{6}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id uuid not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  claimed_by uuid,
  claimed_name text,
  created_at timestamptz not null default now()
);

/* ---------- row-level security ---------- */

do $$
declare t text;
begin
  foreach t in array array['solutions', 'mistakes', 'flashcard_decks', 'flashcards', 'flashcard_reviews', 'devices', 'device_link_codes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

/* ---------- realtime: private channel per account ---------- */
-- Linked devices talk over the private broadcast channel "user:<their user id>".
-- Only a device signed in to that account may listen or send on it.
drop policy if exists "own channel read" on realtime.messages;
create policy "own channel read" on realtime.messages for select to authenticated
  using (realtime.topic() = 'user:' || auth.uid()::text);
drop policy if exists "own channel write" on realtime.messages;
create policy "own channel write" on realtime.messages for insert to authenticated
  with check (realtime.topic() = 'user:' || auth.uid()::text);
