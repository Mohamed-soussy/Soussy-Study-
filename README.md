# Soussy Study

An AI study platform for IB Diploma and American high school students (and any curriculum),
built for a CAS project at Khalid International Schools, Riyadh. **Students never pay.**

Built phase by phase from the Master Build Prompt (section 16). **All 7 phases are built:**

- **Phase 1, Foundation:** design system, logo, sign-in, onboarding, app shell, dashboard, English and Arabic.
- **Phase 2, Calendar + Study Hub:** smart calendar, file vault, AI tutor with citations, intent cards.
- **Phase 3:** solver with a Verified badge, flashcards (FSRS), timer bubble, AI teachers, split screen, linked devices.
- **Phase 4, AI whiteboard:** speaks and draws in sync; pause, circle a shape and ask.
- **Phase 5:** lesson recording analyzer; school connections Levels 1 and 2 (calendar feeds, pasted text, Microsoft).
- **Phase 6:** Teams Level 3 (background sync, class transcripts), resource finder, community vault, moderation.
- **Phase 7:** XP, streaks, badges and leaderboards; study rooms; Squads; teach-back; mock exams and rubric feedback;
  IB Core and college-prep workspaces; teacher mode; parent view; weekly report; invites; accessibility; privacy tools.

**Deliverables** (section 16): the live site (Vercel), this repository, a 2-minute demo video
(`docs/soussy-study-demo.mp4`, silent with captions: record a voice-over), the "For school IT" one-pager
(`docs/for-school-it.pdf`, also live at `/school-it`), and the pilot kit (`docs/pilot.md`). The pilot report itself
comes from running the 2-week pilot with a KiS class.

## Turn everything on (checklist)

| What | Where | Unlocks |
| --- | --- | --- |
| Run `supabase/migrations/0001` … `0007` in order | Supabase → SQL Editor | Accounts and every feature's data |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env | Real accounts (otherwise demo mode) |
| `SUPABASE_SERVICE_ROLE_KEY` (server only) | Vercel env | Shared whiteboard cache, note approvals, guardian links, parent view, account deletion, Teams |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | Vercel env | All AI features |
| `TAVILY_API_KEY` (free at tavily.com) | Vercel env | Resource finder web search (demo cards without it) |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (+ optional `MS_TENANT_ID`, `TOKEN_ENCRYPTION_KEY`) | Vercel env, Microsoft Entra app | "Connect Microsoft" (steps in `.env.example`) |
| `MS_LEVEL3=1`, `CRON_SECRET` + the cron block at the end of `0006` | Vercel env + Supabase (pg_cron, pg_net) | Teams Level 3, only after KiS IT approves |
| Make a moderator / teacher: `update profiles set role = 'moderator' where id = (select id from auth.users where email = '…');` | Supabase → SQL Editor | Moderation queue, teacher mode |
| Realtime → Settings → turn off "Allow public access" | Supabase | Private channels for devices, Squads and rooms |

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Without a Supabase key the app runs in **demo mode** (shown as a "Demo mode" badge):
everything works, but it's saved only in that browser.

## Connect Supabase (real accounts)

1. In Supabase, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_…` to `0007_…`).
   They were tested on Postgres 16 in order and twice (safe to re-run), with the row-level security rules exercised.
2. Copy **Project Settings → API → anon public key** into `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (see `.env.example` for every setting, including the AI keys).
3. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback`
   (and your live URL's `/auth/callback` later) to the redirect URLs.
4. Email + password works right away. Google and Microsoft need providers turned on in
   **Authentication → Providers** with a Google Cloud OAuth client and a Microsoft Entra app.

## The AI: three engines, one privacy rule

All routing lives in `src/lib/ai/engines.ts` (`ROUTES`). The rule, from section 1A of the build prompt:
**the Gemini free tier may use what it receives to improve Google's products, so it never gets a student's
personal data.** The code refuses to send `personal` data to Gemini even if someone changes a route by mistake.

| Job | Engine | Data | Why |
| --- | --- | --- | --- |
| Tutor chat | Groq (GPT-OSS 120B → 20B) | personal | Fast replies; student's words and files |
| File tagging, dates → Review tray | Groq (GPT-OSS 20B) | personal | Student's own files |
| Reading photos / handwriting | Groq (Qwen 3.8 vision) | personal | Student's own images |
| Whiteboard question ("interrupt and ask") | Groq | personal | Student's own question |
| Whiteboard lessons | Gemini (3.1 Flash-Lite → 3 Flash → 3.5 Flash) | public | Syllabus topics, cached and shared; ~2.5 s per lesson |
| Focus snapshot check | Gemini (3.1 Flash-Lite) | opt-in image | Only if the student turns on cloud checks and accepts the warning |
| Lesson transcription | Groq Whisper (large-v3-turbo) | personal | Class recordings, in ~2-minute pieces |
| Lesson analysis, lesson chat, quizzes, pasted school text | Groq (GPT-OSS 120B / 20B) | personal | The student's lessons and messages |
| Community note checks, Squad chat moderation, "Merge top 3" | Groq (GPT-OSS 20B / 120B) | personal | Student-written content |
| Mock exams, marking, rubric feedback, teach-back, IB Core helpers | Groq (GPT-OSS 120B → 20B → Qwen) | personal | The student's own work |
| Study-room spot check, slide reading | Groq (Qwen 3.8 vision) | personal | Images of students never go to Gemini |
| Resource finder summaries | Gemini (3.1 Flash-Lite) | public | Public web pages about a syllabus unit |
| Embeddings (search by meaning) | Hugging Face (BAAI/bge-m3) | personal | Off: the Hugging Face key was removed |

Every call has a time limit and falls back to the next model when one is busy. Each student gets 60 AI requests
a day (`DAILY_AI_LIMIT`); cached whiteboard lessons don't count. Prompts are versioned in `src/prompts/`.

## AI whiteboard (section 7)

`src/app/(app)/whiteboard/`, `src/components/whiteboard/player.tsx`. Gemini returns a JSON timeline: short spoken
sentences, each with drawing actions (text, line, arrow, rect, circle, curve, highlight) on a 1000 × 625 board, tied to
the word where they should appear. The browser's free Web Speech API reads each sentence; its word-boundary events
reveal the drawings on a Konva canvas (with a timed fallback for voices that don't send them). Pause, jump to a step,
change speed, captions-only mode, and **interrupt and ask**: pause, tap or circle a shape, ask about it.

## Focus room (section 12A)

`src/app/(app)/focus/`, `src/lib/focus/`. A focus timer plus:

- **Full Focus Mode:** fullscreen, and leaving the tab pauses the timer and is counted. Browsers don't let any website
  block other tabs; this notices and nudges instead.
- **Camera focus mode (on-device, default):** MediaPipe face landmarks + object detection run in the browser from
  files served by this site (`public/mediapipe`). One frame every 2.5 s is checked for presence, head turn, tiredness
  and a phone, then dropped. Nothing is uploaded. Rules in `src/lib/focus/rules.ts` follow the build prompt exactly
  (away 60 s, auto-pause 2 min, look-away 30 s, phone ~3 of 10 min with no progress, one check-in per 10 min,
  sensitivity, "That was wrong").
- **Cloud checks (opt-in, off by default):** a 256 px JPEG every 2 minutes to Gemini after a clear warning that
  Google may use it. Rate-limited on the server (1 a minute, 300 a day).

## What's in Phase 6

| Area | Where |
| --- | --- |
| Resource finder: searches by curriculum → subject → unit (Tavily), ranks official → trusted study sites → student-made → video, blocks pirate past-paper sites, cards with a 3-line summary and "why it's useful", save to vault with notes, "Make questions from this" (original, never copied), official past-paper stores linked | `src/components/vault/finder.tsx`, `src/app/api/resources/`, `src/lib/resources/trust.ts` |
| Community vault: share notes, cheat sheets, mind maps, decks, "traps I fell into"; AI check before publishing (on topic, readable, not copied, no personal data, safe); ratings; Top-rated, Teacher-approved and moderator-verified "Scored 7" badges; "Merge the top 3" with citations; reports (2 reports hide a note); points and a contributor certificate | `src/components/vault/community.tsx`, `src/app/api/community/` |
| Moderation queue (notes, reports, room strikes, grade proofs) | `src/app/(app)/moderate/` |
| Teams Level 3: background sync every 30 minutes (pg_cron → `/api/cron/school-sync`), class meeting transcripts imported into Lessons, handles "transcripts disabled by the school" | `src/lib/school/ms-fetch.ts`, `src/app/api/cron/` |
| Database | `supabase/migrations/0006_vault_community.sql` |

## What's in Phase 7

| Area | Where |
| --- | --- |
| Progress: XP from real studying, levels, streak with a weekly freeze, 10 badges, 14-day study chart (with table view), weak topics by unit, score-report import (Cognia/MAP), contributor certificate | `src/app/(app)/progress/`, `src/lib/progress/` |
| Leaderboards (12B): opt-in, nicknames on public boards, verified time only, 10 h/day cap, nothing midnight–5 am, under-13s never public, flagged numbers held | `src/components/progress/leaderboard.tsx`, `leaderboard()` in `0007` |
| Weekly report and balance check (4+ deadlines in 2 days; sleep message after 11 pm) | `src/components/progress/weekly.tsx` |
| Practice: timed original mock exams marked against a markscheme, teach-back with "Sam", rubric feedback (IB IA/EE/TOK/English, AP) with 3 fixes, always an estimate | `src/app/(app)/exam/`, `src/prompts/coach.v1.ts` |
| IB Core: TOK knowledge questions, essay and exhibition planners; EE research-question feedback, word tracker, milestones to calendar, RPPF reflections, MLA/APA citations; CAS log with strands, outcomes, photos, project stages, export | `src/app/(app)/core/`, `src/components/core/ib.tsx` |
| College prep: GPA with what-if grades, AP countdowns, SAT/ACT plan, college deadlines | `src/components/core/american.tsx` |
| Study rooms (12A.4–12A.5): cameras only (microphone never requested), age bands, guardian approval link for under-18s, rules checklist, school and friend rooms, background blur, on-device NSFW.js + weapon checks before anything is sent, AI spot check about once a minute, snapshots never stored, fixed reactions, reports and strikes, watermark, 9 people, 3-hour limit | `src/app/(app)/rooms/`, `src/lib/rooms/`, `src/app/guardian/` |
| Squads: invite-only groups of 8, AI-moderated chat, shared deadlines/links/whiteboard topics, live quiz battles | `src/app/(app)/squads/` |
| Teacher mode: classes, posts with due dates, anonymous class weak topics (5+ students), verify notes | `src/app/(app)/teach/` |
| Parent view, invites (+10 AI uses a day each), KiS school page | `src/app/parent/`, `src/app/join/`, `src/app/school/kis/` |
| Accessibility: readable font, text size, reduced motion, read-aloud in the top bar, captions on whiteboard and lessons | `src/lib/a11y/`, Settings |
| Privacy: download all my data, delete my account; "How to use AI honestly" | Settings, `src/app/api/account/delete/`, `src/app/honesty/` |
| Database | `supabase/migrations/0007_phase7.sql` |

## Test results

- **Phase 2:** quick-add dates and subjects, PDF citations to the right page, essay refusal with an outline offer.
- **Phase 3:** 20/20 solver problems verified; FSRS rescheduling; two-tab linked devices.
- **Phase 4:** whiteboard first drawing in about 3.4 s, cached replay 0.4 s; circle-and-ask.
- **Phase 5:** a 45-minute recording with 3 spoken homework items: all 3 found with the right dates (including
  "next lesson" from the timetable) and working "Heard at" links; a decoy ignored; merged with the same Teams task.
- **Phase 6:** an unsafe note (phone numbers, selling answers) rejected; good notes published; merge with citations.
- **Phase 7:** room snapshots shared and cheers delivered between two students; Squad chat blocks personal info and
  insults; quiz battles; mock exams marked.
- **Lighthouse** (production build, every page): desktop performance 91–100, accessibility 100, best practices 100;
  phone accessibility 100, phone performance 80–99 (slow 4G and 4× CPU simulation; the app is mostly rendered in the browser).

## What's in Phase 5 (and Phase 4)

**Phase 4, AI whiteboard,** was built early (with the three-engine setup) and passes its checks: speaking and drawing
start in about 3.4 s, each drawing lands on its word, and pausing, circling a shape and asking gets an answer about it.

| Area | Where |
| --- | --- |
| **Lesson analyzer**: upload video/audio (up to 3 h), a Teams transcript (.vtt / .docx), or record audio in class | `src/app/(app)/lessons/` |
| Transcription with Groq Whisper, in ~2-minute pieces cut at quiet moments, in the browser (the recording is never uploaded) | `src/lib/lessons/audio.ts`, `src/app/api/lessons/transcribe/` |
| Slides and whiteboard read from video frames when the picture changes, pinned to their time | `src/lib/lessons/frames.ts`, `src/app/api/lessons/slide/` |
| Homework, tests, deadlines, announcements, stressed points, concepts, class questions, chapters, each with the exact quote and time | `src/prompts/lesson.v1.ts`, `src/app/api/lessons/analyze/` |
| Real dates from "for Thursday", "next lesson" (from the timetable), "by the 14th", counted from the lesson date, in code, not by the AI | `src/lib/school/dates.ts` |
| Cross-check with the calendar and Teams: New / Already there (merged, both sources) / Different date (settle in one tap) | `src/lib/school/match.ts`, `src/lib/school/apply.ts` |
| Lesson page: player, transcript that follows along, chapters, action items with "Heard at 34:12", summary, "What I missed", flashcards, 10-question quiz, whiteboard recap, notes to the right unit folder, chat with timestamped quotes | `src/app/(app)/lessons/[id]/` |
| **School Level 1** (no approval): calendar feeds (.ics, weekly repeats, time zones), "Paste from school" | `src/lib/school/ics.ts`, `src/app/api/school/`, `src/components/school/connections-panel.tsx` |
| **School Level 2**: "Connect Microsoft" (OAuth + PKCE, read-only): Outlook calendar, OneDrive files, Teams assignments; tokens AES-256-GCM encrypted, server only; sync on open + every 30 min; per-type and per-class toggles; disconnect with keep/delete | `src/lib/school/microsoft.ts`, `src/app/api/microsoft/` |
| Home → "New from school" and the calendar Review tray (Accept / Edit / Dismiss) | `src/components/school/inbox.tsx`, `review-item.tsx` |
| "For school IT" one-pager (prints to PDF) | `/school-it` |
| Database: lessons, connections, encrypted connection_secrets, event origins / external ids | `supabase/migrations/0005_lessons_connections.sql` |

**To turn on "Connect Microsoft"**, register an app in Microsoft Entra ID and set `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
(steps in `.env.example`). Until then the card says what is missing and can show clearly labeled demo data. Teams
assignments usually need the school's IT to approve the app once; calendar and files usually work without it.

**Groq free-tier limits for lessons:** Whisper allows about 2 hours of audio per hour and 8 hours a day per account; a
45-minute class uses one AI use from the daily allowance.

## What's in Phase 3

| Area | Where |
| --- | --- |
| Solver: type (math keyboard + preview), photo, paste, file; steps, hint mode, "Why this step?", graph, calculator help, mark scheme, try a similar one, mistake log, send to whiteboard | `src/app/(app)/solver/`, `src/app/api/solve/`, `src/prompts/solver.v1.ts` |
| **Verified badge**: every answer re-checked by mathjs (equations, systems, units, derivatives, integrals, limits). Failed check → automatic re-solve → else "Uncertain". 20/20 test problems verified. | `src/lib/solver/verify.ts` |
| Flashcards with FSRS (ts-fsrs): decks from files, chats or by hand; flip, type, multiple choice, match game | `src/app/(app)/flashcards/`, `src/lib/flashcards/fsrs.ts`, `src/app/api/cards/` |
| Timer bubble: plan from Today's plan, break bank, warnings at 2 min / 100% / 150%, emergency pause, pop-out window, end summary + explain-back | `src/components/session/bubble.tsx`, `src/lib/session/store.ts` |
| AI teachers: Ms. Noor, Zed, Mr. Hadid, Coach Rami, Professor Layla, The Examiner, build your own; per subject; own voice | `src/lib/teachers.ts`, `src/components/teachers/` |
| Split screen: any two tools, drag to a side, resize, saved layouts, swipe on phones | `src/app/(app)/workspace/` |
| Linked devices: 6-digit code / QR, same account only, max 3, shared session, send to device, remote, scanner, desk camera, audio device | `src/lib/devices/sync.ts`, `src/components/devices/`, `src/app/(app)/remote|scan|link/` |
| Notes: typed + handwriting pad | `src/app/(app)/notes/` |
| Database: solutions, mistakes, flashcards (+ reviews), devices, link codes, prefs, private realtime channel | `supabase/migrations/0004_phase3.sql` |

**Groq free-tier limits:** 8,000 tokens per minute per model (about 2 solutions a minute per model, ~6 across the three
models we rotate through) and 1,000 requests a day per model. The app waits and retries when a model is busy, but a
whole class at once needs Groq's paid Developer tier.

## What's in Phase 2

| Area | Where |
| --- | --- |
| Calendar: month, week, day, agenda; drag to move; every event type and field | `src/app/(app)/calendar/`, `src/components/calendar/` |
| Plain-language quick-add (English + Arabic, no AI needed) | `src/lib/calendar/quick-add.ts` |
| Review tray, study sprints, milestone chains, workload strip, re-balance | `src/lib/calendar/logic.ts` |
| Private calendar link for Google / Outlook / Apple | `src/app/api/ics/[token]/route.ts` |
| Vault: auto folders (Subject → Unit → Topic), uploads, camera, storage meter | `src/components/hub/files-tab.tsx`, `src/curriculum/units.ts` |
| Reading files: PDF, Word, PowerPoint, text; images and scanned PDFs via AI | `src/lib/extract.ts`, `src/app/api/extract/` |
| AI tagging: subject, unit, topic, summary, key terms, dates → Review tray | `src/app/api/tag/`, `src/prompts/tag-file.v1.ts` |
| File viewer: highlights, comments, "Ask AI about this page" | `src/app/(app)/hub/file/[id]/` |
| Tutor chat: sources first, page citations, Socratic / "Just show me", math, voice, read-aloud | `src/components/hub/chat-tab.tsx`, `src/app/api/chat/`, `src/prompts/chat.v1.ts` |
| Intent cards (all groups from section 6.3) | `src/lib/hub/intent-cards.ts` |
| Database: events, folders, files, file_chunks, file_notes, chats, messages, ai_usage, storage bucket | `supabase/migrations/0002_calendar_hub.sql` |

## What's in Phase 1

| Area | Where |
| --- | --- |
| Color tokens (light + dark), fonts, 12 px cards | `src/app/globals.css`, `src/app/layout.tsx` |
| Logo (SVG), favicon, 192/512 app icons, PWA manifest | `src/components/brand/logo.tsx`, `scripts/make-icons.mjs`, `src/app/manifest.ts` |
| English + Arabic, right-to-left | `messages/en.json`, `messages/ar.json`, `src/i18n/` |
| Curriculum packs (IB DP, American HS, Build my own) | `src/curriculum/` |
| Onboarding: terms, about you, school, curriculum, subjects (IB HL/SL rules), learning quiz, goals, connect | `src/app/onboarding/` |
| Sign-in (Google, Microsoft, email) + demo mode | `src/app/sign-in/`, `src/app/auth/callback/` |
| App shell: sidebar, top bar, phone tab bar, Home, Settings | `src/components/shell/`, `src/app/(app)/` |
| Database: `profiles`, `enrollments`, row-level security, under-13 guardian lock | `supabase/migrations/0001_foundation.sql` |


## Limits and what needs something from outside

- **Things only you can do:** run the 2-week pilot, record the demo voice-over, and get KiS IT approval for Teams Level 3.
- **Keys not added yet:** web search (`TAVILY_API_KEY`) and Microsoft sign-in show labeled demo data until added.
- **Study rooms use snapshot mode** (a small picture every 10 s, as the build prompt makes the default). Live video
  would need a self-hosted LiveKit or Jitsi server. Open rooms between schools stay off until after the KiS pilot.
- **On-device room checks** cover nudity (NSFW.js) and knives; smoking, vaping, gestures and ID cards are caught by the
  AI spot check and by reports.
- **Guardian approval** works by a link the student shares; without an email service the app can't confirm who opens
  it. Under-13 sign-up approval still needs an email service.
- **Free AI tiers:** Groq allows about 8,000 tokens a minute per model; a whole class at once needs Groq's paid tier.
- **Search by meaning** (embeddings) is off: Hugging Face was removed; full-text search is used.
- **Other platforms:** Google Classroom and Canvas connectors, and ManageBac/Toddle beyond calendar feeds, need a
  school partnership.
- **Speaker labels** come from Teams transcripts only; Whisper recordings have none.
- **Two-voice audio summaries** need a paid text-to-speech key; read-aloud uses the browser's voices.
- **School directory:** only KiS is listed; others use "My school is not listed". The optional mascot isn't drawn.
