# Soussy Study

An AI study platform for IB Diploma and American high school students (and any curriculum),
built for a CAS project at Khalid International Schools, Riyadh. **Students never pay.**

Built phase by phase from the Master Build Prompt (section 16). Done so far:

- **Phase 1 — Foundation:** design system, logo, sign-in, onboarding, app shell, dashboard, English and Arabic.
- **Phase 2 — Calendar + Study Hub:** smart calendar, file vault, AI tutor with citations, intent cards.
- **Phase 3 — Solver, flashcards, timer, teachers, split screen, devices:** see below.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Without a Supabase key the app runs in **demo mode** (shown as a "Demo mode" badge):
everything works, but it's saved only in that browser.

## Connect Supabase (real accounts)

1. In Supabase, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_…` to `0004_…`).
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
| Embeddings (search by meaning) | Hugging Face (BAAI/bge-m3) | personal | Open-source; needs Inference Provider credits |

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

Tools from later phases (Calendar, Study Hub, Whiteboard…) are in the menu and say which phase delivers them.

## Not done yet (needs something from outside)

- **Search by meaning** (pgvector + Hugging Face embeddings) is wired but the Hugging Face account has no Inference credits; search uses Postgres full-text search until then.
- **Scanned PDFs** have no text layer; students upload photos of the pages instead (read privately by Groq).
- **Import from OneDrive, Google Drive and Teams** arrives with the school connectors in phase 5.
- **Audio and video transcripts** arrive in phase 5. Files upload and play now.
- **Two-voice audio summaries** need a text-to-speech key; the script and browser read-aloud work now.
- **Sharing with a Squad** arrives with Squads in phase 7.

- **Guardian approval emails** for under-13 students: needs an email service. These accounts stay locked until then.
- **Google / Microsoft sign-in**: needs the OAuth apps above.
- **School directory**: only KiS is listed; others use "My school is not listed".
- **Mascot "Sous"**: optional in the spec, not drawn yet.
- **Download / delete my data**: Phase 7.
