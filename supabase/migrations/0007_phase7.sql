-- Soussy Study, Phase 7: progress and leaderboards (12.4, 12B), IB Core and college prep
-- (12.2), mock exams (12.1), Squads (12.4), live study rooms (12A.4–12A.5), teacher mode,
-- parent view and invites (12.5). Run in Supabase: SQL Editor → New query → paste → Run.
-- Needs 0006 first. Safe to run more than once.

/* ---------- profile settings for Phase 7 ---------- */

alter table public.profiles add column if not exists leaderboard_opt_in boolean not null default false;
alter table public.profiles add column if not exists leaderboard_real_name boolean not null default false;
alter table public.profiles add column if not exists rooms_guardian_ok boolean not null default false;
alter table public.profiles add column if not exists parent_token text unique;     -- read-only weekly summary link
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists ai_bonus integer not null default 0; -- extra daily AI uses from invites

-- Students can't grant themselves room approval or invite bonuses.
create or replace function public.guard_profile_p7() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_setting('soussy.system', true) = 'on' then return new; end if;
  new.rooms_guardian_ok := old.rooms_guardian_ok;
  new.ai_bonus := old.ai_bonus;
  new.referred_by := old.referred_by;
  return new;
end $$;
drop trigger if exists profiles_guard_p7 on public.profiles;
create trigger profiles_guard_p7 before update on public.profiles for each row execute function public.guard_profile_p7();

/* ---------- XP, streaks and verified study time (12.4, 12B) ---------- */

create table if not exists public.xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('task', 'focus', 'cards', 'quiz', 'lesson', 'solver', 'community', 'streak', 'badge', 'exam')),
  points integer not null check (points between 0 and 200),
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists xp_user_idx on public.xp_events (user_id, created_at desc);

-- One row per student per day. Minutes count only while the timer runs and the student is
-- active; the app never logs time between midnight and 5 am, and the database caps a day at
-- 10 hours (section 12B: healthy limits).
create table if not exists public.study_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  minutes integer not null default 0 check (minutes between 0 and 600),
  on_task_pct smallint check (on_task_pct between 0 and 100),
  questions integer not null default 0 check (questions >= 0),
  correct integer not null default 0 check (correct >= 0),
  units integer not null default 0 check (units >= 0),
  subject_minutes jsonb not null default '{}',  -- {"phys": 45, ...}
  flagged boolean not null default false,        -- unusual numbers, held from boards for review
  primary key (user_id, day)
);
create or replace function public.guard_study_day() returns trigger language plpgsql as $$
begin
  new.minutes := least(new.minutes, 600);
  new.correct := least(new.correct, new.questions);
  if new.day > current_date + 1 then raise exception 'Future days can''t be logged.'; end if;
  -- Nobody studies 9+ hours with 100% on-task every day; flag it for a human to look at.
  if new.minutes >= 540 and coalesce(new.on_task_pct, 0) >= 99 then new.flagged := true; end if;
  return new;
end $$;
drop trigger if exists study_days_guard on public.study_days;
create trigger study_days_guard before insert or update on public.study_days for each row execute function public.guard_study_day();

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'mock', 'battle', 'lesson')),
  subject_code text,
  unit text,
  score numeric not null default 0,
  total numeric not null default 0,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

/* ---------- IB Core and college prep (12.2) ---------- */

create table if not exists public.core_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'tok_kq', 'tok_exhibition', 'tok_essay', 'ee', 'ee_meeting', 'ee_source',
    'cas_experience', 'cas_project', 'gpa_course', 'ap_exam', 'test_plan', 'college'
  )),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists core_items_user_idx on public.core_items (user_id, kind);

insert into storage.buckets (id, name, public) values ('core', 'core', false) on conflict (id) do nothing;
drop policy if exists "core own files" on storage.objects;
create policy "core own files" on storage.objects for all to authenticated
  using (bucket_id = 'core' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'core' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
declare t text;
begin
  foreach t in array array['xp_events', 'study_days', 'quiz_attempts', 'core_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

/* ---------- leaderboards (12B) ---------- */

-- Returns only opted-in students, nicknames on public boards, top N plus the caller's own
-- row, and never under-13s on public boards. Flagged days don't count.
create or replace function public.leaderboard(scope text, period text default 'week', subject text default null, lim integer default 10)
returns table (rank bigint, name text, minutes bigint, on_task numeric, questions bigint, accuracy numeric, units bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid()),
  pool as (
    select p.*, (p.date_of_birth is not null and p.date_of_birth > current_date - interval '13 years') as under13
    from profiles p
    where p.leaderboard_opt_in
      and (scope = 'public' or (p.school is not null and p.school = (select school from me)))
      and (scope <> 'grade' or (p.year = (select year from me)))
      and (subject is null or exists (select 1 from enrollments e where e.user_id = p.id and e.subject_code = subject))
  ),
  totals as (
    select p.id,
      case when scope = 'public' or not p.leaderboard_real_name or p.full_name is null then coalesce(nullif(p.nickname, ''), 'Student ' || left(p.id::text, 4)) else p.full_name end as name,
      p.under13,
      sum(case when subject is null then d.minutes else coalesce((d.subject_minutes ->> subject)::int, 0) end) as minutes,
      round(avg(d.on_task_pct)::numeric, 0) as on_task,
      sum(d.questions) as questions,
      round(100.0 * sum(d.correct) / nullif(sum(d.questions), 0), 0) as accuracy,
      sum(d.units) as units
    from pool p join study_days d on d.user_id = p.id
    where not d.flagged
      and (period = 'all' or d.day >= date_trunc('week', current_date + 1)::date - 1) -- weeks start Sunday
    group by p.id, p.nickname, p.full_name, p.leaderboard_real_name, p.under13
  ),
  ranked as (
    select row_number() over (order by minutes desc nulls last) as rank, * from totals
    where not (scope = 'public' and under13)
  )
  select rank, name, minutes, on_task, questions, accuracy, units, id = auth.uid()
  from ranked where rank <= lim or id = auth.uid()
  order by rank
$$;
grant execute on function public.leaderboard(text, text, text, integer) to authenticated;

/* ---------- Squads (12.4): invite-only groups of up to 8 ---------- */

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.squad_members (
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null default 'Student',
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id)
);
create table if not exists public.squad_messages (
  id bigint generated always as identity primary key,
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname text not null default 'Student',
  body text not null check (char_length(body) between 1 and 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.squad_items (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.squads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('link', 'deadline', 'note', 'whiteboard', 'deck')),
  title text not null check (char_length(title) between 1 and 200),
  url text,
  due timestamptz,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.is_squad_member(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from squad_members where squad_id = s and user_id = auth.uid())
$$;

-- Joining needs the code; at most 8 members.
create or replace function public.join_squad(join_code text, nick text default 'Student') returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  select id into s from squads where code = upper(trim(join_code));
  if s is null then raise exception 'No squad has that code.'; end if;
  if (select count(*) from squad_members where squad_id = s) >= 8 then raise exception 'This squad is full (8 members).'; end if;
  insert into squad_members (squad_id, user_id, nickname) values (s, auth.uid(), left(coalesce(nullif(trim(nick), ''), 'Student'), 30)) on conflict do nothing;
  return s;
end $$;
grant execute on function public.join_squad(text, text) to authenticated;

-- The creator joins their own squad automatically.
create or replace function public.squad_owner_joins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into squad_members (squad_id, user_id, nickname)
  values (new.id, new.owner_id, coalesce((select nullif(nickname, '') from profiles where id = new.owner_id), 'Student'))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists squads_owner_joins on public.squads;
create trigger squads_owner_joins after insert on public.squads for each row execute function public.squad_owner_joins();

alter table public.squads enable row level security;
drop policy if exists "members see squad" on public.squads;
create policy "members see squad" on public.squads for select to authenticated using (public.is_squad_member(id) or owner_id = auth.uid());
drop policy if exists "create squad" on public.squads;
create policy "create squad" on public.squads for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "owner edits squad" on public.squads;
create policy "owner edits squad" on public.squads for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner deletes squad" on public.squads;
create policy "owner deletes squad" on public.squads for delete to authenticated using (owner_id = auth.uid());

alter table public.squad_members enable row level security;
drop policy if exists "members see members" on public.squad_members;
create policy "members see members" on public.squad_members for select to authenticated using (public.is_squad_member(squad_id));
drop policy if exists "leave squad" on public.squad_members;
create policy "leave squad" on public.squad_members for delete to authenticated
  using (user_id = auth.uid() or exists (select 1 from squads where id = squad_id and owner_id = auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['squad_messages', 'squad_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_squad_member(squad_id))', t);
    execute format('drop policy if exists "members write" on public.%I', t);
    execute format('create policy "members write" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.is_squad_member(squad_id))', t);
    execute format('drop policy if exists "own delete" on public.%I', t);
    execute format('create policy "own delete" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
grant select, insert, update, delete on public.squads, public.squad_members, public.squad_messages, public.squad_items to authenticated;

-- Squad chat and quiz battles use the private realtime channel "squad:<id>", members only.
drop policy if exists "squad channel read" on realtime.messages;
create policy "squad channel read" on realtime.messages for select to authenticated
  using (realtime.topic() like 'squad:%' and public.is_squad_member(substr(realtime.topic(), 7)::uuid));
drop policy if exists "squad channel write" on realtime.messages;
create policy "squad channel write" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'squad:%' and public.is_squad_member(substr(realtime.topic(), 7)::uuid));

/* ---------- live study rooms (12A.4, 12A.5): cameras only, strict safety ---------- */

create table if not exists public.room_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  strikes smallint not null default 0,
  banned_until timestamptz,          -- null with strikes >= 3 means permanent
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.room_bans enable row level security;
drop policy if exists "see own ban" on public.room_bans;
create policy "see own ban" on public.room_bans for select to authenticated using (user_id = auth.uid() or public.is_moderator());
grant select on public.room_bans to authenticated;

-- 13–15, 16–17 and 18+: rooms never mix adults with under-18s.
create or replace function public.age_band(dob date) returns text language sql immutable as $$
  select case
    when dob is null then null
    when dob > current_date - interval '13 years' then 'under13'
    when dob > current_date - interval '16 years' then '13-15'
    when dob > current_date - interval '18 years' then '16-17'
    else '18+' end
$$;

-- Can the signed-in student join a room right now? Returns '' if yes, else the reason.
create or replace function public.room_block_reason() returns text
language sql stable security definer set search_path = public as $$
  select case
    when p.id is null then 'signed_out'
    when public.age_band(p.date_of_birth) is null then 'no_age'
    when public.age_band(p.date_of_birth) = 'under13' then 'too_young'
    when public.age_band(p.date_of_birth) <> '18+' and not p.rooms_guardian_ok then 'needs_guardian'
    when b.strikes >= 3 and b.banned_until is null then 'banned'
    when b.banned_until > now() then 'banned'
    else '' end
  from (select auth.uid() as uid) u
  left join profiles p on p.id = u.uid
  left join room_bans b on b.user_id = u.uid
$$;
grant execute on function public.room_block_reason() to authenticated;

-- Room channels are named "room:<band>:<school or open>:<room>", so only students who may be
-- in a room, in the right age band, can listen or send. (Snapshots go over this channel and
-- are never stored.)
create or replace function public.may_use_room(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.room_block_reason() = ''
    and split_part(topic, ':', 2) = public.age_band((select date_of_birth from profiles where id = auth.uid()))
    and (split_part(topic, ':', 3) in ('open', 'friends') or split_part(topic, ':', 3) = md5(coalesce((select school from profiles where id = auth.uid()), '')))
$$;
drop policy if exists "room channel read" on realtime.messages;
create policy "room channel read" on realtime.messages for select to authenticated
  using (realtime.topic() like 'room:%' and public.may_use_room(realtime.topic()));
drop policy if exists "room channel write" on realtime.messages;
create policy "room channel write" on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'room:%' and public.may_use_room(realtime.topic()));

-- Strikes (12A.5): 1st = 24-hour ban, 2nd = 7 days, 3rd = permanent. Moderators only.
create or replace function public.room_strike(target uuid, why text, severe boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare n smallint;
begin
  if not public.is_moderator() and coalesce(auth.role(), '') <> 'service_role' then raise exception 'Moderators only.'; end if;
  insert into room_bans (user_id, strikes, reason) values (target, 0, why) on conflict (user_id) do nothing;
  update room_bans set strikes = case when severe then 3 else strikes + 1 end, reason = why, updated_at = now() where user_id = target returning strikes into n;
  update room_bans set banned_until = case when n = 1 then now() + interval '24 hours' when n = 2 then now() + interval '7 days' else null end where user_id = target;
end $$;
grant execute on function public.room_strike(uuid, text, boolean) to authenticated;

-- Two reports on the same student from different people remove them from rooms until a
-- moderator reviews it (a 24-hour hold, lifted or turned into a strike).
create or replace function public.room_auto_hold() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.target_kind = 'room' and new.target_user is not null
     and (select count(distinct reporter_id) from reports where target_kind = 'room' and target_user = new.target_user and status = 'open' and created_at > now() - interval '1 day') >= 2 then
    insert into room_bans (user_id, strikes, banned_until, reason) values (new.target_user, 0, now() + interval '24 hours', 'held for review')
    on conflict (user_id) do update set banned_until = greatest(coalesce(room_bans.banned_until, now()), now() + interval '24 hours'), reason = 'held for review', updated_at = now();
  end if;
  return new;
end $$;
drop trigger if exists reports_room_hold on public.reports;
create trigger reports_room_hold after insert on public.reports for each row execute function public.room_auto_hold();

/* ---------- guardian approval links (rooms for under-18s) ---------- */

create table if not exists public.guardian_requests (
  token text primary key default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null default 'rooms' check (purpose in ('rooms')),
  guardian_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.guardian_requests enable row level security;
drop policy if exists "own requests" on public.guardian_requests;
create policy "own requests" on public.guardian_requests for select to authenticated using (user_id = auth.uid());
drop policy if exists "make request" on public.guardian_requests;
create policy "make request" on public.guardian_requests for insert to authenticated with check (user_id = auth.uid());
grant select, insert on public.guardian_requests to authenticated;
-- The guardian's page decides through the server (service role), never from the student's account.

/* ---------- teacher mode (12.5) ---------- */

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  subject_code text,
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);
create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create table if not exists public.class_posts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 4000),
  url text,
  due timestamptz,
  created_at timestamptz not null default now()
);
create or replace function public.in_class(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_members where class_id = c and user_id = auth.uid())
      or exists (select 1 from classes where id = c and teacher_id = auth.uid())
$$;
create or replace function public.join_class(join_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select id into c from classes where code = upper(trim(join_code));
  if c is null then raise exception 'No class has that code.'; end if;
  insert into class_members (class_id, user_id) values (c, auth.uid()) on conflict do nothing;
  return c;
end $$;
grant execute on function public.join_class(text) to authenticated;

alter table public.classes enable row level security;
drop policy if exists "class read" on public.classes;
create policy "class read" on public.classes for select to authenticated using (public.in_class(id));
drop policy if exists "teacher creates" on public.classes;
create policy "teacher creates" on public.classes for insert to authenticated with check (teacher_id = auth.uid() and public.is_teacher());
drop policy if exists "teacher edits" on public.classes;
create policy "teacher edits" on public.classes for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists "teacher deletes" on public.classes;
create policy "teacher deletes" on public.classes for delete to authenticated using (teacher_id = auth.uid());
alter table public.class_members enable row level security;
drop policy if exists "member rows" on public.class_members;
-- Teachers see how many joined (via class_size), not who; students see their own row.
create policy "member rows" on public.class_members for select to authenticated using (user_id = auth.uid());
drop policy if exists "leave class" on public.class_members;
create policy "leave class" on public.class_members for delete to authenticated using (user_id = auth.uid());
alter table public.class_posts enable row level security;
drop policy if exists "class posts read" on public.class_posts;
create policy "class posts read" on public.class_posts for select to authenticated using (public.in_class(class_id));
drop policy if exists "teacher posts" on public.class_posts;
create policy "teacher posts" on public.class_posts for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid() and exists (select 1 from classes where id = class_id and teacher_id = auth.uid()));
grant select, insert, update, delete on public.classes, public.class_members, public.class_posts to authenticated;

create or replace function public.class_size(c uuid) returns integer language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from classes where id = c and teacher_id = auth.uid()) then (select count(*)::int from class_members where class_id = c) end
$$;
grant execute on function public.class_size(uuid) to authenticated;

-- Anonymous class-wide weak topics: counts only, and only when 5+ students contributed,
-- so no single student can be picked out.
create or replace function public.class_weak_topics(c uuid) returns table (topic text, students bigint, mistakes bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(m.topic, ''), 'General') as topic, count(distinct m.user_id), count(*)
  from mistakes m
  join class_members cm on cm.user_id = m.user_id and cm.class_id = c
  join classes cl on cl.id = c and cl.teacher_id = auth.uid()
  where m.created_at > now() - interval '60 days'
    and (cl.subject_code is null or m.subject is null or m.subject = cl.subject_code
         or m.subject ilike (select subject_name from enrollments where user_id = m.user_id and subject_code = cl.subject_code limit 1))
  group by 1
  having count(distinct m.user_id) >= 5
  order by 3 desc
  limit 15
$$;
grant execute on function public.class_weak_topics(uuid) to authenticated;

/* ---------- invites (12.5) ---------- */

-- Both students get 10 extra AI uses a day. One redemption per student, never your own code.
create or replace function public.redeem_invite(code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare inviter uuid;
begin
  select id into inviter from profiles where referral_code = upper(trim(code));
  if inviter is null or inviter = auth.uid() then return false; end if;
  if (select referred_by from profiles where id = auth.uid()) is not null then return false; end if;
  perform set_config('soussy.system', 'on', true);
  update profiles set referred_by = inviter, ai_bonus = least(ai_bonus + 10, 50) where id = auth.uid();
  update profiles set ai_bonus = least(ai_bonus + 10, 50) where id = inviter;
  perform set_config('soussy.system', 'off', true);
  return true;
end $$;
grant execute on function public.redeem_invite(text) to authenticated;

-- AI allowance per day: 60 plus invite bonuses (used by the server's guard).
create or replace function public.my_ai_limit() returns integer language sql stable security definer set search_path = public as $$
  select 60 + coalesce((select ai_bonus from profiles where id = auth.uid()), 0)
$$;
grant execute on function public.my_ai_limit() to authenticated;
