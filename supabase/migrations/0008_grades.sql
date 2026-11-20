-- Soussy Study: grade-first onboarding. Students pick their school grade (6–12, or 13 for
-- university) before their curriculum, so the right curricula and years are suggested.
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to run more than once.

alter table public.profiles add column if not exists grade smallint check (grade between 1 and 13);
