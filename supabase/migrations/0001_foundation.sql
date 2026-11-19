-- Soussy Study, Phase 1 (Foundation): profiles + enrollments.
-- Run this in Supabase: Dashboard → SQL Editor → paste → Run.
-- Row-level security means a student can only ever read or change their own rows (section 14).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  date_of_birth date,
  guardian_email text,
  -- 'not_needed' | 'pending' | 'approved'. Under-13 accounts stay pending until a guardian approves.
  guardian_consent text not null default 'not_needed',
  country text,
  city text,
  school text,
  curriculum text,          -- card the student picked, e.g. 'ib', 'american', 'cambridge'
  pack_id text,             -- curriculum pack powering it, e.g. 'ib-dp'
  year text,                -- 'dp1', 'g10', ...
  exam_session text,        -- IB: 'May 2027'
  semester text,            -- American: 'fall' | 'spring'
  ee_subject text,
  ee_supervisor text,
  learning_blend jsonb,     -- {"visual":50,"steps":30,"listening":10,"peers":10}
  hours_per_week smallint,
  next_exam_date date,
  terms_version text,
  terms_accepted_at timestamptz,
  onboarding_step smallint not null default 0,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_code text not null,
  subject_name text not null,
  level text not null,      -- 'HL' | 'SL' | 'Standard' | 'Honors' | 'AP' | 'None'
  color smallint not null default 0 check (color between 0 and 7),
  target_grade text,
  teacher_name text,
  class_code text,
  created_at timestamptz not null default now(),
  unique (user_id, subject_code)
);

create index if not exists enrollments_user_idx on public.enrollments (user_id);

-- Keep updated_at current.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Under-13 accounts need guardian consent before activation (section 3, step 1).
-- Students cannot approve themselves: only the service role (a future guardian
-- approval link) may move guardian_consent to 'approved'.
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
declare
  under13 boolean := new.date_of_birth is not null
    and new.date_of_birth > (current_date - interval '13 years');
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Ignore whatever the student's browser sent for this column.
  if tg_op = 'UPDATE' then
    new.guardian_consent := old.guardian_consent;
  else
    new.guardian_consent := 'not_needed';
  end if;

  if not under13 then
    new.guardian_consent := 'not_needed';
  elsif new.guardian_consent is distinct from 'approved' then
    new.guardian_consent := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.guard_profile();

-- Row-level security.
alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own enrollments" on public.enrollments;
create policy "own enrollments" on public.enrollments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
