-- Soussy Study 0009: no age restriction on study rooms (every signed-in student can create
-- or join a room). Bans from moderators still apply. Live video goes peer to peer; this
-- channel only carries the connection set-up messages and room info.
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run more than once.

create or replace function public.room_block_reason() returns text
language sql stable security definer set search_path = public as $$
  select case
    when u.uid is null then 'signed_out'
    when b.strikes >= 3 and b.banned_until is null then 'banned'
    when b.banned_until > now() then 'banned'
    else '' end
  from (select auth.uid() as uid) u
  left join room_bans b on b.user_id = u.uid
$$;
grant execute on function public.room_block_reason() to authenticated;

-- Channels: "room:all:code:<CODE>" (create / join with a code), "room:all:open:<key>",
-- or "room:all:<md5(school)>:<key>" (your school's subject rooms).
create or replace function public.may_use_room(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.room_block_reason() = ''
    and (split_part(topic, ':', 3) in ('open', 'friends', 'code')
         or split_part(topic, ':', 3) = md5(coalesce((select school from profiles where id = auth.uid()), '')))
$$;
