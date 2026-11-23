# Arjun — CLAUDE.md

Read at the start of every session. Verified against the code on **2026-10-21** (after PR #118). `AUDIT.md`, `PROJECT.md`, `PRODUCT-AUDIT.md` and `PLAN.md` are older (Jul–Aug 2026) and partly stale — trust the code and this file over them. Product rules live in `docs/ARJUN-MVP-SPEC.md`.

---

## 1. PROJECT

- App: **Arjun** — AI mental performance coaching for young Indian athletes (14–25). Sports psychologist in your pocket, not therapy.
- Live URL: `coacharjun.in`. Currently in a **free pilot** (founder grants pilot access per athlete).
- Solo non-technical founder. India market. ₹299/month after the pilot.
- Explain things to the founder in plain language, short, with tables/lists.
- **Design rule (founder, Nov 2026): build everything with the Hook Model** (Trigger → Action → Variable reward → Investment → next trigger). Guard rails: no streaks/rankings/fake urgency; habit for training, not screen time. Details: `docs/PATH-STRATEGY.md`; per-surface gaps + proposals: `docs/HOOK-AUDIT.md`.
- **Language (decided Nov 2026): English-first, India only.** Screens are English; Coach understands Hinglish and replies in Hinglish (English letters) when the athlete writes that way. Hindi UI is switched off via `client/src/i18n/languages.js` (`HINDI_ENABLED = false`) — Hindi strings stay in translations.js but **new features need English copy only**; keep Hindi keys working only where tests require parity. Safety detection stays Hinglish-aware.

## 2. TECH STACK

- Frontend (`client/`): React 18 + Vite 5 + Tailwind 3.4 (`lucide-react`, `recharts`, `html-to-image`, `vite-plugin-pwa`) → **Vercel**
- Founder Dashboard (`founder-dashboard/`): separate Vite app → its own Vercel project; talks to `/api/founder/*`
- Backend (`server/`): Node.js + Express 4 → **Railway** (`npm start` runs `prisma db push` first)
- DB: PostgreSQL via Prisma 5.7
- AI: Claude API (`@anthropic-ai/sdk` 0.104). Model: `process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'`. **Coach chat only** uses `COACH_MODEL` (falls back to `ANTHROPIC_MODEL`) via `services/coaching/coachModel.js`: low effort + more max_tokens + server-side refusal fallback on newer models, prompt-cached system prompt for all.
- Payments: Razorpay 2.9.6. ⚠️ Website prices (`client/src/constants/plans.js`, ₹500/₹2,500) must match the Razorpay plans in `RAZORPAY_PLAN_MONTHLY/YEARLY`; the in-app `/pricing` copy still says ₹299/₹2,499 until the new plans exist. Email: Resend 4.8. Push: `web-push` 3.6 (VAPID). Auth: JWT + bcrypt (no OAuth)
- **Git workflow:** each session works on its own `claude/*` branch → PR to `main` → founder reviews the Vercel preview → squash-merge. Never push to `main` directly. Merges to `main` deploy both Vercel and Railway.

## 3. KEY FILES

- `server/src/routes/chat.js:269` — `buildSystemPrompt()` (ends ~822) — Arjun's brain
- `server/src/services/coaching/` — buffered tool loop for main chat, coaching tools, coaching-state transitions
- `server/src/services/safety/` — deterministic safety screen (`screenSafetyText`), `recordSafetyEvent`, fixed guidance (`safetyMessages.js`)
- `server/src/middleware/requireGuardianConsent.js` — blocks coaching endpoints for under-18s until a guardian consents
- `server/src/routes/auth.js:15` — `SAFE_SELECT` — user fields safe to return
- `server/prisma/schema.prisma` — 41 models (additive changes only)
- `server/src/index.js` — all route mounts, CORS allowlist, starts the push scheduler
- `client/src/App.jsx` — all routes + redirects of retired pages
- `client/src/i18n/translations.js` — every UI string, EN + HI (~4,400 lines — grep the namespace first). `client/src/i18n/languages.js` — `HINDI_ENABLED` switch
- `client/src/components/ui/` — shared primitives: `Button`, `Card`, `PageHeader`, `SectionLabel`, `SaveStatus`
- `client/src/components/HelplineList.jsx` + `client/src/constants/helplines.js` — iCall 9152987821 · KIRAN 1800-599-0019 · 112
- `client/tailwind.config.js` / `client/src/index.css` — design tokens + theme system
- `client/src/api.js` — `apiFetch()` returns the raw Response; always `.then(r => r.json())`

## 4. DATABASE MODELS (41)

Additive changes only — never drop/rename. User has 30 relations; all cascade on user delete except as noted.

- **Core:** `User` (incl. `dateOfBirth`, `guardianEmail`, `guardianConsentAt`, `pilotAccessUntil`, `lastActiveAt`, `lastSeenAt`, legacy `ritualName/ritualSteps`, `cueWord*`), `ChatSession`, `Message`, `UserMemory`, `PasswordResetToken`
- **Coaching loop:** `UserCoachingState`, `CoachingCycle`, `Prescription`, `ActiveCoachingSelection` (Restrict FKs to cycle/prescription), `CurrentCoachingFocus`, `Plan`, `PlanSession`, `SkillProgress`
- **Onboarding/profile:** `OnboardingSession`, `ActiveOnboardingSession`, `StartingPerformanceProfile`, `StartingProfileWording`
- **Tools & records:** `MindJournalEntry`, `ToolReport`, `SelfTalkCard`, `BodyResetSession` (Pressure Reset), `Routine` + `RitualLegacyImport` (Ritual), `Debrief`, `GameSession`, `WeeklyReport`
- **Safety & ops:** `SafetyEvent` (structured fields only, no message content; founder review status), `ProcessedWebhookEvent` (Razorpay dedup), `PilotCommunication` + `Target` + `Response`, `PushNotificationPreference`, `PushSubscription`, `FounderEmailCampaign`, `FounderEmailDelivery`
- **Learning path (Nov 2026):** `PathProgress` (one per athlete: chapter `order` JSON, `startedAt`; next match `nextMatchDay` "YYYY-MM-DD" India time, `lastMatchDay`, `lastMatchFeel` well/mixed/tough; `playPlan` Json {tool reset|rep|ritual, moment, cue?, at} — the if–then play plan, cleared by the match review), `PathStep` (finished steps: chapterKey × stepKey learn/practise/play/reflect, `outcome` helped/tried for play; unique per user+chapter+step). Both cascade on user delete. `MindChallengeResult` (points + levels JSON per skill, `mindLevel`, investment `focusSkill`/`nextMatch`; one per 28 days; cascade).
- **Legacy, still in schema:** `CheckIn`, `MentalFitnessEntry`, `UserAchievement`, `DrillCompletion` (no route writes `CheckIn`/`DrillCompletion` any more)
- `Routine`: steps JSON `[{id,kind,instruction,cue,origin}]`, max 5 per user under a User-row lock (`services/routines/routineStore.js`). `RitualLegacyImport` keeps legacy `User.ritualName/ritualSteps` mirrored to the imported routine (Coach still reads those legacy fields).
- ⚠️ `Message` has no `@@index` (slow history queries at scale).
- Inert/unused: `googleId`, `reminderOptIn`, `phone`, `razorpayCustomerId`, `oceanO–N`.

## 5. API ROUTES

Mounted in `server/src/index.js`. All need JWT (`authenticate` → `req.userId`) unless marked. **Consent** = `requireGuardianConsent`. **Access** = `checkFreeLimit` (premium → 14-day trial → founder pilot grant → 429 `TRIAL_ENDED`).

| Mount | Endpoints | Notes |
|---|---|---|
| `/api/auth` | register (DOB required; under 13 refused; under 18 needs a guardian email), guardian-consent, resend-guardian-consent, login, me, me/language, me/onboarding, me/profile, account (DELETE), logout, forgot/reset-password | public: register, login, guardian-consent, logout, forgot/reset |
| `/api/chat` | GET messages, GET usage, **POST message**, **POST wizard** | Consent + **Access** on message & wizard |
| `/api/sessions` | list/create, end-stale, :id/messages, :id/fresh-start, :id/end, PATCH/DELETE :id | AI summaries; Consent on end/end-stale, no Access. Main chat = one 7-day cycle per ChatSession, archived on rollover → one Weekly Review per cycle |
| `/api/onboarding` | GET/PATCH session, POST session/complete | |
| `/api/profile` | GET starting, POST confirm, PATCH current-focus, PATCH answers, POST start-chat | AI wording of the starting profile; Consent on start-chat |
| `/api/profile-intro` | GET | Retired AI surface — fixed welcome text for old clients; Consent |
| `/api/plan` | GET current, POST generate, PATCH session/:id/complete | |
| `/api/prescriptions` | POST claim-opener, POST :id/complete, GET active | Consent |
| `/api/skills` | GET :skillKey, POST :skillKey/learn, POST :skillKey/quick-check | |
| `/api/mental-rep` | POST complete | Quick Rep |
| `/api/mind-journal` | POST, GET, PATCH context, GET/DELETE :id | AI reflection review; Consent on read/write |
| `/api/path` | GET, POST steps, PUT match, POST match/review, PUT plan | Learning path (`services/path/`): GET builds the path (order from the starting-profile priority, one current chapter) and records practise/reflect earned from ToolReports, Routines and Mind Journal entries since the path started; POST marks learn/practise/play (play needs outcome helped/tried) on the current or a finished chapter only. PUT match {day|null} (today…+180 days); POST match/review {feel, used} after the match day clears it and "helped/tried" ticks the current chapter's Play step (`services/path/matchDay.js`). PUT plan {tool, moment, cue?} or {plan:null} (moments in `PLAN_MOMENTS`; cue ≤60 chars, required for rep/ritual, safety-screened). No AI |
| `/api/mind-challenge` | GET, POST, PATCH latest/goal | Mind Challenge (`services/path/mindChallenge.js`): GET {latest, previous, nextAt, canTake}; POST {points per skill 0–6} → Level 1–5 per skill + Mind Level (409 inside the 28-day wait); PATCH goal {focusSkill, nextMatch} also moves that chapter up the path. No AI |
| `/api/playbook` | GET | Feeds My practice (`/my-practice`), Train's This week strip and Home's Your words (`takeForwards`: the athlete's own journal take-forward lines); old `/playbook` URL still redirects to Home |
| `/api/weekly-reports` | GET (lazy-generates last week) | AI; Consent, no Access |
| `/api/debrief` | POST, GET | AI; Consent, no Access (UI retired → redirect) |
| `/api/self-talk` | POST generate, save, GET cards, PATCH/DELETE cards/:id, POST cards/:id/practice | Consent + **Access** on generate |
| `/api/body-reset` | POST arjun-note, save, GET, DELETE :id | Pressure Reset; Consent + **Access** on arjun-note |
| `/api/routines` | GET, POST, GET/PATCH/DELETE :id, POST import-legacy, POST suggest | Ritual UI. Saves are safety-screened. `suggest`: rules decide the shape; Arjun words the steps from the athlete's context (`services/routines/personalizeSuggestion.js`) when entitled + consented, else rules wording; never saves; aiLimiter |
| `/api/ritual` | GET/POST me | Legacy single ritual, no current UI caller (cached old clients); safety-screened; mirrors the linked routine |
| `/api/games` | POST xp, POST session, GET status | Focus Lock / Reset Rally |
| `/api/progress` · `/api/achievements` · `/api/streaks` | GET summary · GET me · POST freeze | Legacy; Progress UI retired |
| `/api/user` | DELETE data/:type | 6 types: chat-history, reflections, mental-profile, cue-word, checkin-history (MentalFitnessEntry + CheckIn), routines |
| `/api/payments` | POST webhook (public, HMAC), create-subscription, GET status, POST cancel | |
| `/api/safety` | POST event | client-detected safety events (Pressure Reset keyword hit); metadata only |
| `/api/activity` | POST presence | heartbeat for "Live now / Seen X ago" |
| `/api/pilot-communications` | GET next, POST :id/seen · dismiss · not-now · respond | in-app founder messages |
| `/api/push-notifications` | GET/PATCH preferences, POST subscribe, POST unsubscribe | PATCH also takes `matchReminders` / `rematchReminders` / `weeklyReminders` booleans (Hook fix 4) |
| `/api/contact` | POST | public, rate-limited |
| `/api/founder/*` | auth (login/session), pulse, safety-events (list/get/review), pilot-overview, pilot-access (grant/revoke), pilot-communications, email (athletes/test/send/list), push-test | **founder auth** (`founderAuthenticate`), not athlete JWT |
| `/api/health` | GET | public |

**AI endpoints without the Access check** (fine while the pilot is free; revisit before paid launch): session summaries, weekly-reports, debrief, Mind Journal review, starting-profile wording.

## 6. ENV VARIABLES

**Railway (backend):** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `JWT_SECRET` (never rotate in prod), `PORT`, `CLIENT_URL` (comma-separated extra CORS origins + password-reset links), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FOUNDER_PIN`, `FOUNDER_TOKEN`, `FOUNDER_SESSION_SECRET`, `FOUNDER_DASHBOARD_URL` (CORS for the dashboard), `FOUNDER_TEST_EMAIL`; optional Coach-only: `COACH_MODEL` (e.g. `claude-sonnet-5-5` / `claude-haiku-5-5`), `COACH_EFFORT` (`low` default on newer models; `none` sends nothing), `COACH_REFUSAL_FALLBACK` (`off` disables)

**Vercel (client):** `VITE_API_URL`, `VITE_RAZORPAY_KEY_ID`, `VITE_VAPID_PUBLIC_KEY`

`GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` appear only in dead `config/passport.js`. No Twilio/WhatsApp/Sentry/PostHog code exists.

CORS is an allowlist (production domains + `CLIENT_URL` + `FOUNDER_DASHBOARD_URL` + this project's Vercel preview pattern) — not allow-all.

## 7. DESIGN SYSTEM — PLAYBOOK (redesign in progress, Nov 2026)

- **Approved direction "D / Playbook"** (mock-ups: claude.ai artifact "Arjun redesign mockups"): flat colour blocks + flat geometric illustrations, light and dark. Rolled out screen by screen: **done** = tokens/font/nav bar, Home, Train, Coach chat, Profile (saved view), Pressure Reset (+ history), Ritual (list, detail, builder, rehearsal), Quick Rep (all steps), Focus Card Builder + Focus Deck, Mind Journal (all screens), My practice, Weekly reviews (latest week = blue block), Account (short settings list at `/account` + Edit profile at `/account/profile`, same `AccountPage` with `view` prop; badges/XP no longer shown), onboarding + Performance check-in answers (`components/onboarding/SelectableOption`: card tiles, chosen = brand blue; sun Continue), and the shared practice intro (`components/practice/PracticeShell.jsx` — feature page via `tone` + `Art`). Public pages: website `/` (`pages/LandingPage.jsx`, strings `translations.en.site`; hero = the app on a phone rotating through 3 **real app screenshots** (Coach chat, Home, Pressure Reset) via `RealScreen` in `components/site/PhoneScreens.jsx` (phone scales to ~56% of the screen width, max 250px), "How Arjun helps" uses three real screens (chat, Focus Cards, My practice). Screenshots live in `public/site-screens/*.jpg`, made by `node client/scripts/site-screens.cjs` against `vite preview` with demo data (athlete "Rohan"), captured at a narrow 320×628 so the writing stays readable — **re-run it when those screens change**; the drawn screen components there are now unused; header = logo + "Arjun" in a frosted pill + Start free + menu (Sign in lives in the menu); the phone status bar takes the photo's sky colour (`--site-top`, via `useStatusBarColour({ cssVar })`) and a top band blends it into the photo; footer = part of the final sun block (logo left, links listed top-down on the right, copyright last); colour band per section; small text 15px regular grey; no prices; "Start free" → `/auth?tab=signup`), Free vs Premium `/premium` and plans `/plans` (`pages/site/`, prices from `constants/plans.js`: ₹500/month, ₹2,500/year, yearly pre-selected), sign-up/sign-in (`AuthPage`, theme tokens). The final section uses a drawing of the app (`FinalArt` in `components/site/SiteBits.jsx`) — no stock photos; the hero "Say hi to Arjun" pill is frosted see-through. Contact (topic chips, helplines box), Forgot/Reset password (`components/site/HelpPageShell.jsx`, strings `translations.en.passwordHelp`), Privacy/Terms/Refund (`components/site/LegalBits.jsx`: shared header/title/section look + mint "In short" box; legal wording unchanged). **Still old layout** = in-app `/pricing` checkout. ⚠️ The Refund page still lists ₹299/month and ₹1999/year — update the legal text when the new Razorpay plans go live. The gradient intro pieces (`ToolIntroLayout`, `GradientIconTile`, `InfoStatCard`, `ChecklistCard`) were deleted.
- Palette: brand blue `brand.500` = `#1B4DFF` (fills, white text) — used **everywhere**, public pages and the founder dashboard. **Logo = Teer's head, flat, "Calm smile"** (founder pick Nov 2026): `ArjunLogo` in `components/ArjunLogo.jsx` draws it inline (no ids); icon files in `public/brand/arjun/` (`teer-mark.svg` → favicons/favicon.ico, `arjun-mark.svg` white tile → PWA icons + email logo, `arjun-mark-maskable.svg` → maskable + Apple touch; regenerate PNGs from the SVGs, see README.txt); founder dashboard copy `founder-dashboard/public/teer-mark.svg`; darker/pressed `#1238C9`, light blue on dark `#9DB4FF`. The old blues (`#185FA5`, `#1769AA`) are retired. Colour blocks, identical in both themes, dark `inkblock` (`#101533`) text: `sun` `#FFC629` (main action / Talk to Arjun), `coral` `#FF6B4A`, `mint` `#7FE3C4`, `blush` `#FF8AD4` (Mind Journal only), `sky` `#B7C8FF` (Ritual tile). Font **Sora**.
- Blue as TEXT: `text-brand-400/500` resolve to the theme-aware `--brand-text` (not the fill blue, which fails contrast on dark).
- **Premium layer (Nov 2026, `docs/PREMIUM-PLAN.md`):** mascot **Teer** (`components/visuals/Teer.jsx`, 3D renders in `public/brand/teer/teer-{idle,wave,think,breathe,point,cheer,notes,head}.webp`, decorative, `motion` = float/hop/calm, always `motion-safe:`) and soft photo scenes (`components/visuals/SceneBackdrop.jsx`, `public/backgrounds/bg-{track-sunrise,court,lake,stadium-dusk}[-sm].webp`, fade into the page colour, dimmed on dark via `.scene-photo`). Used on: launch screen + HTML splash (Teer waving on a soft peach/blue glow), website hero (track scene + Teer beside the phone) and "Is AI coaching safe?" (court scene + Teer with notes, frosted list), Coach entry screen (Teer thinking), feature + empty + done screens via `components/visuals/MascotArt.jsx` (Teer on a glow: Ritual list = point, Mind Journal hero = notes, Focus Card Builder intro = point, Quick Rep intro = think, My practice empty = wave, Weekly reviews empty = notes; done screens = cheer: Ritual rehearsal, Focus Card saved/practised, Journal saved; Quick Rep done = stadium scene like Pressure Reset), Pressure Reset intro (`PracticeIntro` `mascot="breathe"` `scene="lake"`) and done screen (`PracticeCompletion scene="stadium-dusk"` = dark celebration, white text, `CompletionMascot`). Originals in `docs/assets/premium/`.
- Gradients: soft glows and photo fades are allowed (founder decision Nov 2026, website + app). Still no loud gradient fills on buttons/cards; one colour block per job. Illustrations live in `components/visuals/`: `SportArt.jsx` (one per onboarding sport + neutral fallback), `HomeArt.jsx`, `TrainArt.jsx`, `ProfileArt.jsx`. Profile components must not contain hex colours (test-enforced) — use tokens or a visuals component. Train tiles = `components/train/PracticeBlock.jsx` (`TrainGradientCard`/`PracticeTile` are unused leftovers).
- Launch screen: `components/LaunchScreen.jsx` (while auth loads) and a matching plain-HTML splash inside `#root` in `client/index.html` (before JS loads): Teer waving, "Arjun", "Train your mind like a pro", three pulsing dots. PWA `background_color` = `#EEF3FF`.
- Coach header shares the page colour (`bg-dark-900`, no box), 34px logo.
- Status bar: `useTheme` sets `<meta name="theme-color">` from the live `--bg` token, so the phone's status bar always matches the page (no band or edge). Don't hard-code it.
- Pages shown with the bottom nav need bottom padding of at least `pb-[calc(7.5rem+env(safe-area-inset-bottom))]` (or `pb-28` without iPhone home-bar space), or the floating nav covers their last controls. The nav is `z-50`, so full-screen dialogs/sheets use `fixed inset-0 z-[60]` (or higher).
- Scrolling: `components/ScrollManager.jsx` (in App.jsx) opens every newly visited page at the top and restores the old position on Back/forward. Multi-step flows on one URL call `hooks/useScrollTopOnChange(step)` so each new step starts at the top.
- **Feature pages (founder layout, Nov 2026):** each feature's screens sit on its own page colour via `components/ui/TonePage` (`tone`: mint = Pressure Reset, sky = Ritual, sun = Quick Rep, coral = Focus Cards, blush = Mind Journal). Tokens `--tone-*-page` / `bg-tonepage-*`: the block colour in light (coral and blush use lighter tints `#FFBCAE` / `#FFC2E9` so grey text stays readable), a deep tint in dark. Pages that don't wrap in `TonePage` call `useToneStatusBar(tone)` for the status bar. On the sun page the main button is brand blue instead of sun. Headings and details sit straight on the page, centred, with no boxes; only list items, inputs and choices are cards (`bg-dark-400`). Anything that would match the page colour (selected choices, a category square) switches to brand blue or the card surface. TonePage claims the status bar (`data-status-bar` on `<html>`, honoured by `syncStatusBar` in `hooks/useTheme.js`). Practice intro order: drawing → title → line → duration tag → "What to expect" → "Why this works" (disclosure); no Duration/Best for/Goal tiles. `PageHeader` takes `barClass` to match the page.
- Main action inside a flow = sun button (`bg-sun text-inkblock`, ≥56px). Pressure Reset colour = mint, Ritual = sky; Ritual categories: before play sky, repeated moment mint, pressure moment coral, own situation sun.
- Bottom nav is a floating pill (`--nav-bar`), active item = yellow pill (`--nav-fg-active`) with `--nav-on-active` content.
- Theme: light default → `prefers-color-scheme` auto-dark → manual `[data-theme]` on `<html>` → `localStorage arjun_theme`. Dark tokens are `--dark-*` CSS vars (`bg-dark-900`, `text-ink`, `text-slt`).
- Use `components/ui` primitives, type tokens (`text-display/title/heading/body/caption/micro`), `px-page`. Tap targets ≥ 44px; visible focus rings. Not-yet-redesigned screens still use gradient pieces (`card-hero`, `GradientIconTile`, `btn-gradient`) and purple `#8B5CF6` (`GradientIconTile`, `SelfTalkPage`) — replace them as each screen is redesigned.
- VisualizationPage keeps a hardcoded palette — intentional.

## 8. ATHLETE SURFACES

**Tool names athletes see (founder, Nov 2026):** Quick Rep → **Mind Warm-up**, Focus Cards / Focus Card Builder → **Self-Talk Cards**, Ritual → **Mental Routines**; Pressure Reset and Mind Journal unchanged. Code, routes and keys keep the old names (`/mental-rep`, `/self-talk`, `/ritual`, `quickRep`, `focusCard`, `ritual`). Plain words: "focus word" (not cue), breathe in/out, practise (not rehearse). Coach gets `TOOL_NAMES_NOTE` (`services/path/matchDay.js`) so chat uses the same names. ⚠️ The website screenshots in `public/site-screens/` still show the old names — re-run `client/scripts/site-screens.cjs`.

Bottom nav (Nov 2026): **Home** (`/dashboard`) · **Train** (`/train`, the guided path) · **Arjun** (= Coach, `/coaching`, nav hidden inside chat) · **Tools** (`/tools`). The round account button (`<Navbar bare />`) menu opens **My profile** (`/starting-profile`) and **Settings** (`/account`). Return flow: path links call `markFromPath()` (`utils/practiceReturn.js`, sessionStorage); practices exit to `practiceHome()` = `/train` when started from the path, else `/tools`; Train/Tools mount clears the flag.

| Surface | Route | Notes |
|---|---|---|
| Home | `/dashboard` | No logo bar: day line + greeting with the account button beside it (`<Navbar bare />`, also on Train/Tools) → Mind Challenge card (only when one can be played) → `components/home/HomePathArea.jsx`: on match moments only a one-line dark chip "Match tomorrow · Your prep" / "How did {day} go?" → `/tools` (the prep card `components/match/MatchPrepCard.jsx` and the review card `MatchReviewCard.jsx` live on Tools, founder Nov 2026); then the "Your next step" card, and on other days a "Next match" chip opening `MatchDaySheet.jsx` (also opened after the Mind Challenge when the athlete picks This week/Next week). "Your next step" card (`components/home/PathNextCard.jsx`: the path's next step, hidden while the challenge card shows; also opens `/path/unlocked/:chapter` — `pages/PathUnlockedPage.jsx`, shown once per finished chapter via `takeNewlyFinished` in localStorage `arjun_path_seen`) → **Your words** (Hook fix 6, `components/home/YourWordsCard.jsx`: one thing the athlete made — a Focus Card word, a saved cue, a journal "take forward" line (`takeForwards` in `GET /api/playbook`) or a practice lesson — rotating by day via `pickWords`; links to it; hidden when nothing is saved) → blue "Your practice from Arjun" block with the athlete's sport drawing (`components/home/CurrentPracticeCard.jsx`, read-only `GET /api/prescriptions/active`; hidden when there is no open practice) → sun "Talk to Arjun" (3D Teer waving, plays twice then stops) → blush Mind Journal row → 4 shortcuts (tap = message sent straight away in Coach via `state.autoSend`, only into an existing conversation; otherwise it waits in the composer) |
| Train | `/train` | `pages/TrainPage.jsx`: "This week" strip (`components/home/ThisWeekStrip.jsx`: counts only, no streaks/scores; `thisWeek` from `GET /api/playbook`, taps to My practice) → Mind Challenge card (when due) → **Your path** (`components/path/PathSection.jsx`: Mind Stats mini card when no challenge is due, current chapter's 4 steps + one sun Next button, then the winding road `PathRoad`) |
| Tools | `/tools` | `pages/ToolsPage.jsx` (founder layout, Nov 2026): grouped by moment — **Before you play** (Pressure Reset, Ritual) · **In the moment** (Quick Rep, Focus Cards) · **After you play** (Mind Journal, My practice, Weekly reviews) — each a sideways-scrolling row of square tiles (`components/tools/ToolTile.jsx`, snap, name only). Match moments live here: `components/match/MatchMoment.jsx` on top (day before / match day = prep card; 1–3 days after = "How did it go?", and "After you play" moves first) |
| Coach | `/coaching` | Main chat (see §9). Header: 34px Teer logo, "Arjun", subtitle "Your AI mental coach" (the "not a therapist" disclosure stays on the entry screen + info popover); athlete = blue bubble, Arjun = card-surface bubble; prescribed practice = sun card |
| Mind Journal | `/mind-journal` (+ `/quick`, `/new`, `/new/details`, `/context`, `/:id`) | Guided reflections + quick notes; replaces debrief, check-in and mental-fitness |
| Onboarding (v2, Nov 2026) | `/onboarding` → `/welcome` | 8 screens from `shared/onboarding/v2.json` (edit there, then `npm run build:onboarding-config`), each with an "Arjun uses this to…" line (`screens.<x>.uses` in `i18n/onboardingV2.js`): sport + role (`sport_role`) → Level (`playing_context` = competition level only) → situation (`primary_priority`) → **what you notice first** (`first_signal`: body/thoughts/feelings) → ONE follow-up per situation (`branches[x].onboardingScreenIds`) → **where pressure comes from** (`contextual_pressures`, optional) → **what already helps** (`what_helps`, optional) → **Your week** (`training_time` + a next-match day row saved via PUT /api/path/match on Finish). Uses: `services/path/personal.js` reads them from the latest completed onboarding session → `GET /api/path` `personal`, Coach's internal note (`personalNoteLines`), the reminder time (`reminderTimeFor`: morning 07:00, afternoon 12:30, evening 16:00, else 18:00), a "Start here" tag on Tools (body → Pressure Reset, thoughts → Focus Cards, feelings → Mind Journal), and the profile's "What Arjun knows — and what it does with it" (`components/path/ArjunKnows.jsx`, Change → check-in `?section=personal`). Goals, 4-week outcome, experience, supports and strengths are no longer asked (still in the config, stored answers kept; `computeFlowScreenIds(answers, { full: true })` keeps every older answer reachable so nothing is pruned; the check-in still edits the full branch). Old in-progress sessions resume inside the short flow (`resumeStep`). Then `pages/WelcomePage.jsx`: quietly POSTs `/api/profile/confirm {fit:'CONFIRMED'}`, asks "Which day is your match?" (`MatchDaySheet inline`; skipped when onboarding passes `state.matchAsked`), then "How strong is your mind game?" → `/mind-challenge` with `state.firstRun` (starts at round 1, skips the match question in the investment step) or Skip → Home |
| Mind Challenge | `/mind-challenge` | Dark game screens: intro → 6 rounds (2 questions per skill; Focus = 1 question + 15-s tap-the-blue-ball game `components/path/FocusGame.jsx`) with a skill reveal after each → Mind Stats card (`components/path/MindStatsCard.jsx`, share as image) → investment (pick skill to level up + next match). Home trigger card `components/home/MindChallengeHomeCard.jsx` only when one can be played (New / Rematch). Questions = first draft for sport-psych review (`translations.en.challenge`) |
| Starting profile | `/starting-profile` (+ `/check-in`) | Opens from the account menu ("My profile"). Saved view: name + sport, then `ProfilePathLink` (Mind Stats mini card or "Unlock" card + a row to the path on Train), then the blue Current focus block, My Game, pressure sequence, what helps, strengths, and a row to My practice. Path pages: lesson `/path/:chapter/learn`, chapter `/path/:chapter`, unlocked `/path/unlocked/:chapter`; their fallbacks go to `/train`. Reflect step = `/path/:chapter/reflect` (`pages/PathReflectPage.jsx`: one blush screen, pick a feeling + optional line → Mind Journal QUICK_NOTE → back to Train; no "What are you reflecting on?" picker) |
| Play plan | finish screens of Pressure Reset, Quick Rep, Ritual rehearsal | Hook fix 3: `components/path/PlayPlanCard.jsx` "Take it into play": pick a moment (sport-aware unit, `translations.en.path.plan`) → if–then plan saved via PUT /api/path/plan; "Not now" hides it; offers "Add your match day" when none is set. The plan shows on Train (under the chapter panel), at the top of the match prep card, and "How did it go?" asks "Did you use your plan?" |
| Ritual | `/ritual` | Up to 5 routines: list → detail (steps, when-to-use tip, "Talk to Arjun" prefill) → builder with "Suggest steps for me". "Practise this routine" = one-step-per-screen rehearsal (`components/ritual/RoutineRun.jsx`), saves/tracks nothing |
| Pressure Reset | `/body-reset` (+ `/history`) | Shared practice shell. Opt-in sound + vibration breathing cues (`utils/breathCues.js`, off by default) |
| Quick Rep | `/mental-rep` | Delivers prescribed practices; cue step offers the athlete's own Focus Card words first |
| Focus Card Builder / Focus Deck | `/self-talk`, `/focus-deck` | Max 5 active cards (server-enforced) |
| Skill paths | `/skills/focus-self-talk`, `/skills/pressure-reset` | Learn + quick check |
| Games | `/games/focus-lock`, `/games/reset-rally` | `/games` → `/train` |
| Visualization | `/visualization` | |
| My practice | `/my-practice` | Plain look-back reached from Train: blue "this week" counts block (`thisWeek`), practices from Arjun + reported result, cues, reflection takeaways, link to Weekly reviews. Read-only over `GET /api/playbook`; no scores/streaks/patterns (simpler successor to the retired Playbook, founder-approved Nov 2026) |
| Weekly reviews | `/weekly-reviews` | Reached from the Coach header and from My practice |

Retired → redirects: `/bounce-back`, `/before-you-play`, `/games` → `/train`; `/breathing` → `/body-reset`; `/checkin` → `/mental-fitness` → `/mind-journal`; `/debrief` → journal (or reflection flow with a prescription); `/playbook`, `/progress` → `/dashboard`; `/mental-game-profile` → `/starting-profile`.

## 9. CHAT ARCHITECTURE

- Main chat: `POST /api/chat/message` runs a **buffered** Anthropic tool loop (`services/coaching/bufferedToolLoop.js`, non-streaming, ≤1 coaching-state transition per turn), then sends the reply over SSE; the client reveals it progressively.
- Coaching loop (spec §2): diagnose → **one** prescription at a time → follow-up on next open. Tools/state in `services/coaching/`.
- Quick replies come as structured data from the coaching tools (SSE `quick_replies` event). `[SUGGEST:]` text tags are retired. `[APP:tool]` tags still render as tool cards (`parseArjunMessage.js`).
- Language: English by default, Hinglish (English letters) when the athlete writes Hinglish, never Devanagari unless they do (`langInstruction` in `buildSystemPrompt`). `services/coaching/clarificationHint.js` detects short "didn't understand" replies ("matlab?", "samjha nahi", "what?") and appends a system note to re-explain simply. Manual checks: `docs/HINGLISH-CHECKS.md`.
- Questions (founder-approved, Nov 2026): one main question per reply (2–3 choices inside it allowed), a second only if short and linked, something useful before asking, and one small practical step after ~2–3 back-and-forths (`QUESTIONS` block in Response format rules). Quick-reply chips are retired, so choices are written in the question.
- Every message is first screened by the deterministic safety screen (`screenSafetyText`) before any AI call; flagged → fixed guidance + `SafetyEvent`, no AI.
- Quick chat: **dormant** — server code remains (minimal prompt, own safety blocks) but the client never enables it.
- Context: last 3 ToolReports from the past 7 days (excluding debrief), memories, plan, focus cards, coaching context, and (Hook fix 2) an internal note with the path's current chapter + next step and the next match (`buildPathCoachSection` in `services/path/matchDay.js`, appended after the routine note; best-effort; tells Coach to mention the path only when it fits and to open with how they feel the day before a match; also the play plan via `planText`). Memory extraction is a separate `messages.create`.
- Model settings: `coachRequestSettings()` / `buildCoachSystem()` in `services/coaching/coachModel.js` (system prompt sent as blocks: stable part cached, language/clarification notes uncached after it). The in-loop recovery request strips thinking blocks (`stripThinking`) because it changes the system prompt and tools.
- **Routines in Coach** (Nov 2026): "Talk to Arjun" on a routine passes `routineId` once → `ChatSession.focusRoutineId` (owner-checked; cleared by Start fresh) → an internal note with that routine (`services/coaching/routineFocus.js`). Tool `propose_routine` (not a coaching-state transition; never blocked by/blocking one) stages a card → SSE `routine_proposal` after the reply commits → `components/coach/RoutineProposalCard.jsx`: Save = PATCH (linked routine) or POST (new) on `/api/routines` (validated + safety-screened). Coach never writes routines itself.
- **Start fresh** (Nov 2026): Coach ⋮ menu → confirm → `POST /api/sessions/:id/fresh-start` sets `ChatSession.freshStartAt`. Coach's history and the chat screen then only use messages from that moment; nothing is deleted, the Weekly Review still reads the whole 7-day cycle, and memories / coaching state / practices carry on. No chat list by design.
- ⚠️ No retention job: messages are never deleted on a schedule. The only background job is the push scheduler: at most one reminder per athlete per local day (~18:00, or shortly before their usual training time from onboarding). Since Hook fix 4 (Nov 2026) that reminder is specific on days that matter (`services/pushMoments.js` `pickMoment`: match tomorrow → "how did your match go?" for 3 days → Mind Challenge rematch for its first 3 days → Mondays "your week with Arjun" if they chatted that week), else the generic rotation. Fixed copy, no athlete text. Per-kind switches `matchReminders` / `rematchReminders` / `weeklyReminders` on `PushNotificationPreference` (default on), shown in Settings under the notifications switch. Service-worker allowlist: /mental-rep, /dashboard, /mind-challenge, /weekly-reviews.

## 10. SAFETY RULES

- Two layers: (1) deterministic screen (`services/safety/`) on chat, wizard, Mind Journal, Pressure Reset, Focus Cards, debrief, sessions, routines, legacy ritual, profile → fixed guidance + structured `SafetyEvent`, nothing saved/sent to AI; (2) prompt-level crisis + injury blocks in `buildSystemPrompt` (EN + Hinglish).
- Helplines everywhere via `HelplineList`: iCall 9152987821 · KIRAN 1800-599-0019 · Emergency 112.
- Founder reviews safety events in the Founder Dashboard (`/api/founder/safety-events`, review status).
- Minors: DOB required at signup; under 13 refused; under 18 → guardian consent email; `requireGuardianConsent` blocks coaching endpoints until consented.

## 11. PAYMENT RULES

- Tier upgraded ONLY in webhook `subscription.activated` (payments.js:52). No client-callable upgrade.
- Webhook: HMAC-SHA256 over the raw body, wired before `express.json()`; **idempotent** via `ProcessedWebhookEvent` (duplicate event → P2002 → skipped).
- `RAZORPAY_KEY_SECRET` never sent to the client or logged.
- ⚠️ Account deletion: Razorpay cancel failure is logged and deletion continues — a live subscription can outlive the user (auth.js ~382).
- Pilot: founder grants `pilotAccessUntil`; `checkFreeLimit` allows premium → trial → pilot.

## 12. DELETION RULES

Full account deletion (`DELETE /api/auth/account`): read user → Razorpay cancel (best-effort) → delete Messages → ChatSessions → `user.delete()` (cascades) → audit log + confirmation email.

Selective deletion (`DELETE /api/user/data/:type`): 6 types — `chat-history`, `reflections` (Debrief), `mental-profile`, `cue-word`, `checkin-history` (MentalFitnessEntry **and** CheckIn), `routines` (all routines + legacy ritual, import marked so nothing is recreated). No selective option for ToolReport / SelfTalkCard / BodyResetSession / MindJournalEntry (Mind Journal has its own per-entry delete).

## 13. OPEN ISSUES

1. AI endpoints without the Access check (list in §5) — matters at paid launch.
2. Razorpay cancel failure doesn't stop account deletion (§11).
3. `Message` has no index; no message retention job (§4, §9).
4. Coach does not see the athlete's routine list. It sees the imported legacy routine (via `User.ritualName/ritualSteps`) and, since Nov 2026, the ONE routine linked by "Talk to Arjun" (`ChatSession.focusRoutineId`). Showing all routines would need founder approval.
5. Old docs (`AUDIT.md`, `PROJECT.md`, `PRODUCT-AUDIT.md`, `PLAN.md`) are stale. Current plan: `docs/ROADMAP.md` (Nov 2026).
6. **Active work: `docs/PATH-STRATEGY.md`** — the learning path (Mind Challenge → Learn → Practise → Use in play → Reflect → level up). Read it at the start of every session; build in its order, mock-ups first. The premium-look plan (`docs/PREMIUM-PLAN.md`) is finished (Nov 2026).

Fixed since the July audit: quick-chat safety (now dormant + own safety blocks), age/guardian consent gate, safety-event logging + founder review, `checkin-history` deletion, broken `--color-dark-*` vars, webhook idempotency, CORS allow-all, KIRAN on all safety surfaces.

## 14. CODING PATTERNS

- Routes: `express.Router()` + `authenticate` sets `req.userId`. Newer routes use a factory (`createXRouter({ store, ... })`) so tests can inject fakes.
- Claude: non-streaming `messages.create`, strip markdown fences before `JSON.parse`; new `Anthropic({ apiKey })` per request. Main chat via the buffered tool loop.
- Any athlete-written text that is saved or sent to AI goes through the deterministic safety screen first (persist nothing when flagged; record a `SafetyEvent`; return fixed guidance).
- ToolReports: `prisma.toolReport.create({ toolType, summary, arjunResponse, details: JSON.stringify({...}) })` on tool completion.
- XP: `awardXP(userId, amount)` in gamification.js (legacy inline `xp: { increment }` remains in chat.js/debrief.js). XP is invisible to athletes — build no new gamification.
- Translations: `translations[language].namespace.key`; no hardcoded copy in JSX. English-first: new strings need `en`; add `hi` only where a parity test requires it (Hindi UI is off).
- Frontend fetch: `apiFetch(path, init)` → raw Response.
- New page: `client/src/pages/`, `<Route>` in App.jsx (BottomNav for library pages, none for full-screen flows), strings in translations.js.
- Tests: `cd client && npm test` (node:test source checks + vitest DOM), `cd server && npm test` (node:test). Build: `cd client && npm run build` must pass before reporting done.

## 15. DO NOT TOUCH (without explicit instruction)

- `buildSystemPrompt()` — Arjun's brain (chat.js:269–822)
- Webhook handler payment logic (payments.js:15–100)
- `SAFE_SELECT` (auth.js:15)
- Cascade delete relations in schema.prisma
- Crisis/injury safety blocks inside `buildSystemPrompt` (chat.js ~338–395 quick, ~759–815 main) and the deterministic safety screen rules (`services/safety/safetyRules.js`)
- `authenticate`, `requireGuardianConsent`, `founderAuthenticate` middleware
- Razorpay plan IDs in env
- `calculateStreak()` (gamification.js:146) and entitlement logic (`checkFreeLimit` / `hasPilotAccess` in chat.js)

## 16. DEAD CODE — DO NOT USE

- `server/src/config/passport.js` — never required; passport deps not installed; importing it crashes
- `checkChatAchievements` (gamification.js:119) — exported, never called
- Translation namespaces `pressureReset`, `wizard`, `games` — zero references
- Quick chat path in chat.js — dormant (client never sets `chatMode='quick'`)
- `/api/ritual/me` — kept only for cached old clients
- `/api/progress`, `/api/achievements`, `/api/streaks` — their UIs are retired

## 17. TOKEN DISCIPLINE

- grep/search before reading full files; read only the section needed
- translations.js is ~4,400 lines — always grep for the namespace first
- List changed files + one-line summaries when reporting back
- Confirm `npm run build` passes before reporting done
- Use Plan Mode for any multi-file change

---

*Keep this file accurate. Update it when features ship, issues in §13 are fixed, or key files move.*
