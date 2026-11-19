# Soussy Study

An AI study platform for IB Diploma and American high school students (and any curriculum),
built for a CAS project at Khalid International Schools, Riyadh. **Students never pay.**

Built phase by phase from the Master Build Prompt (section 16). Done so far:

- **Phase 1 — Foundation:** design system, logo, sign-in, onboarding, app shell, dashboard, English and Arabic.
- **Phase 2 — Calendar + Study Hub:** smart calendar, file vault, AI tutor with citations, intent cards.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Without a Supabase key the app runs in **demo mode** (shown as a "Demo mode" badge):
everything works, but it's saved only in that browser.

## Connect Supabase (real accounts)

1. In Supabase, open **SQL Editor** and run each file in `supabase/migrations/` in order (`0001_…`, then `0002_…`).
2. Copy **Project Settings → API → anon public key** into `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback`
   (and your live URL's `/auth/callback` later) to the redirect URLs.
4. Email + password works right away. Google and Microsoft need providers turned on in
   **Authentication → Providers** with a Google Cloud OAuth client and a Microsoft Entra app.

## The AI

Add `ANTHROPIC_API_KEY` to `.env.local` (and to Vercel's environment variables when you deploy).
Models live in one place, `src/lib/ai/server.ts`: Claude Sonnet 5.5 for the tutor, Claude Haiku 5.5 for
tagging and reading images. Prompts are versioned in `src/prompts/`. Each student gets 60 AI requests a day;
when they run out, everything else keeps working and the count resets the next day.

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

- **AI answers** need `ANTHROPIC_API_KEY`. Without it the chat, tagging and image reading say so instead of pretending.
- **Search by meaning** (pgvector embeddings) needs an embeddings provider key; search uses Postgres full-text search for now.
- **Import from OneDrive, Google Drive and Teams** arrives with the school connectors in phase 5.
- **Audio and video transcripts** arrive in phase 5. Files upload and play now.
- **Two-voice audio summaries** need a text-to-speech key; the script and browser read-aloud work now.
- **Sharing with a Squad** arrives with Squads in phase 7.

- **Guardian approval emails** for under-13 students: needs an email service. These accounts stay locked until then.
- **Google / Microsoft sign-in**: needs the OAuth apps above.
- **School directory**: only KiS is listed; others use "My school is not listed".
- **Mascot "Sous"**: optional in the spec, not drawn yet.
- **Download / delete my data**: Phase 7.
