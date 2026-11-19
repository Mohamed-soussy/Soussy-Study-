# Soussy Study

An AI study platform for IB Diploma and American high school students (and any curriculum),
built for a CAS project at Khalid International Schools, Riyadh. **Students never pay.**

This repository is **Phase 1 — Foundation** of the Master Build Prompt (section 16):
design system, logo, sign-in, onboarding, app shell and an empty dashboard, in English and Arabic.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Without a Supabase key the app runs in **demo mode** (shown as a "Demo mode" badge):
everything works, but it's saved only in that browser.

## Connect Supabase (real accounts)

1. In Supabase, open **SQL Editor**, paste `supabase/migrations/0001_foundation.sql`, and run it.
2. Copy **Project Settings → API → anon public key** into `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback`
   (and your live URL's `/auth/callback` later) to the redirect URLs.
4. Email + password works right away. Google and Microsoft need providers turned on in
   **Authentication → Providers** with a Google Cloud OAuth client and a Microsoft Entra app.

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

- **Guardian approval emails** for under-13 students: needs an email service. These accounts stay locked until then.
- **Google / Microsoft sign-in**: needs the OAuth apps above.
- **School directory**: only KiS is listed; others use "My school is not listed".
- **Mascot "Sous"**: optional in the spec, not drawn yet.
- **Download / delete my data**: Phase 7.
