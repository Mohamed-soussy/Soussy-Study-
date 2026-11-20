# Soussy Study: 2-week pilot kit (KiS class)

Section 16, Phase 7: *"A pilot group of students uses it for 2 weeks; collect feedback and usage
numbers for the CAS reflection."* This kit has everything needed to run it. Only you can run the
pilot itself.

## Before the pilot (1 week ahead)

1. **Permission.** Show your CAS coordinator and the class teacher `docs/for-school-it.pdf` and this
   plan. Agree which features are in: suggested are all of them except study rooms, which need guardian
   approval for under-18s.
2. **Consent.** Students opt in; under-18s bring the consent note below signed by a guardian.
3. **Accounts.** Students sign up at the live site (or `/school/kis`, which pre-fills the school).
4. **Teacher.** Make the class teacher a teacher in Supabase (SQL Editor):
   `update profiles set role = 'teacher' where id = (select id from auth.users where email = '<their email>');`
   They create a class in **Classes** and share the 6-letter code.
5. **Baseline survey** (5 minutes, Google Forms or Microsoft Forms): questions A1–A6 below.

## During the pilot (2 weeks)

| Day | What students do |
| --- | --- |
| 1 | Onboarding, join the class, add the timetable (.ics) or paste this week's homework |
| 2–3 | Study Hub: upload notes, ask the tutor; one whiteboard lesson |
| 4–5 | Solver and flashcards on a current unit; one mock exam in Practice |
| 6 | Lessons: analyze one recorded class (only with the teacher's permission) |
| 7 | Midpoint check-in (2 questions, below) |
| 8–13 | Normal use: timer bubble for every study session, Squads for group revision |
| 14 | Final survey (B1–B10) and a 10-minute focus group |

## Consent note (for guardians)

> My child may take part in a two-week trial of Soussy Study, a free study app made by a KiS student
> as an IB CAS project. The app stores study data in my child's own account; it can be downloaded or
> deleted at any time in Settings → Privacy. Lesson recordings stay on my child's device. Camera
> features are optional and analyzed on the device. Anonymous usage numbers (for example, total study
> hours of the group) will be used in a CAS reflection. No names will be published.
>
> Student: __________ Guardian: __________ Signature: __________ Date: ______

## Survey

**Baseline (A)**, scale 1–5 unless noted:
- A1. How organized do you feel about deadlines right now?
- A2. How often do you miss homework that the teacher only said out loud? (never … often)
- A3. How many hours do you study outside class in a normal week? (number)
- A4. How confident are you in your weakest subject?
- A5. What tools do you use to study now? (free text)
- A6. What's the hardest part of studying for you? (free text)

**Midpoint (day 7)**: What's the most useful thing so far? What's annoying or broken?

**Final (B)**: repeat A1–A4, then:
- B5. Which three features did you use most?
- B6. Did the lesson analyzer catch homework you would have missed? (yes / no / didn't use)
- B7. Did the AI ever give a wrong answer or a wrong date? Describe it.
- B8. Did anything feel unsafe or uncomfortable (camera, chat, sharing)?
- B9. Would you keep using it? Why?
- B10. One thing to change.

## Usage numbers (anonymous, for the CAS reflection)

Run in Supabase → SQL Editor after day 14. Replace the dates. These give group totals only.

```sql
-- Pilot window
with w as (select date '2026-12-01' as d0, date '2026-12-14' as d1),
pilot as (select id from auth.users, w where created_at::date between w.d0 - 7 and w.d1)
select
  (select count(*) from pilot)                                                     as students,
  (select round(sum(minutes) / 60.0, 1) from study_days, w where user_id in (select id from pilot) and day between w.d0 and w.d1) as verified_study_hours,
  (select count(*) from xp_events, w where user_id in (select id from pilot) and kind = 'task' and created_at::date between w.d0 and w.d1) as tasks_completed,
  (select count(*) from lessons, w where user_id in (select id from pilot) and created_at::date between w.d0 and w.d1) as lessons_analyzed,
  (select count(*) from events, w where user_id in (select id from pilot) and source = 'lesson' and created_at::date between w.d0 and w.d1) as tasks_found_in_lessons,
  (select count(*) from solutions, w where user_id in (select id from pilot) and created_at::date between w.d0 and w.d1) as problems_solved,
  (select count(*) from flashcard_reviews, w where user_id in (select id from pilot) and reviewed_at::date between w.d0 and w.d1) as flashcard_reviews,
  (select count(*) from quiz_attempts, w where user_id in (select id from pilot) and created_at::date between w.d0 and w.d1) as quizzes_and_mocks,
  (select count(*) from community_notes, w where user_id in (select id from pilot) and status = 'approved' and created_at::date between w.d0 and w.d1) as notes_shared,
  (select count(*) from reports, w where created_at::date between w.d0 and w.d1) as safety_reports;

-- Daily active students (for a line chart in the reflection)
select day, count(distinct user_id) as active_students, round(sum(minutes) / 60.0, 1) as hours
from study_days where day between date '2026-12-01' and date '2026-12-14' group by day order by day;

-- AI use per day (spot the free-tier limits)
select day, count(*) as students, sum(count) as ai_uses from ai_usage
where day between date '2026-12-01' and date '2026-12-14' group by day order by day;
```

## CAS reflection prompts

- Which CAS learning outcomes does this project show? (LO3 initiative and planning, LO4 commitment and
  perseverance, LO5 collaboration, LO6 global significance through education access, LO7 ethics:
  privacy, honest AI use and child safety.)
- What did the pilot show that you didn't expect? Use one number and one quote.
- What would you change before offering it to the whole school?
- What ethical choices did you make, and why? (Free for every student; personal data never sent to
  the free Gemini tier; cameras analyzed on the device; AI never writes graded work.)

## Results template

| Measure | Before | After | Change |
| --- | --- | --- | --- |
| Feeling organized (A1, average 1–5) | | | |
| Missed spoken homework (A2) | | | |
| Weekly study hours (self-reported) | | | |
| Verified study hours (app, group total) | — | | |
| Tasks found in recorded lessons | — | | |
| Students who'd keep using it (B9) | — | | |
