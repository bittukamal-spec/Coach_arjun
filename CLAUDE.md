# Arjun — CLAUDE.md

Read at the start of every session. Verified against the code on **2026-10-21** (after PR #118). `AUDIT.md`, `PROJECT.md`, `PRODUCT-AUDIT.md` and `PLAN.md` are older (Jul–Aug 2026) and partly stale — trust the code and this file over them. Product rules live in `docs/ARJUN-MVP-SPEC.md`.

---

## 1. PROJECT

- App: **Arjun** — AI mental performance coaching for young Indian athletes (14–25). Sports psychologist in your pocket, not therapy.
- Live URL: `coacharjun.in`. Currently in a **free pilot** (founder grants pilot access per athlete).
- Solo non-technical founder. India market. ₹299/month after the pilot.
- Explain things to the founder in plain language, short, with tables/lists.

## 2. TECH STACK

- Frontend (`client/`): React 18 + Vite 5 + Tailwind 3.4 (`lucide-react`, `recharts`, `html-to-image`, `vite-plugin-pwa`) → **Vercel**
- Founder Dashboard (`founder-dashboard/`): separate Vite app → its own Vercel project; talks to `/api/founder/*`
- Backend (`server/`): Node.js + Express 4 → **Railway** (`npm start` runs `prisma db push` first)
- DB: PostgreSQL via Prisma 5.7
- AI: Claude API (`@anthropic-ai/sdk` 0.104). Model: `process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'`
- Payments: Razorpay 2.9.6. Email: Resend 4.8. Push: `web-push` 3.6 (VAPID). Auth: JWT + bcrypt (no OAuth)
- **Git workflow:** each session works on its own `claude/*` branch → PR to `main` → founder reviews the Vercel preview → squash-merge. Never push to `main` directly. Merges to `main` deploy both Vercel and Railway.

## 3. KEY FILES

- `server/src/routes/chat.js:269` — `buildSystemPrompt()` (ends ~822) — Arjun's brain
- `server/src/services/coaching/` — buffered tool loop for main chat, coaching tools, coaching-state transitions
- `server/src/services/safety/` — deterministic safety screen (`screenSafetyText`), `recordSafetyEvent`, fixed guidance (`safetyMessages.js`)
- `server/src/middleware/requireGuardianConsent.js` — blocks coaching endpoints for under-18s until a guardian consents
- `server/src/routes/auth.js:15` — `SAFE_SELECT` — user fields safe to return
- `server/prisma/schema.prisma` — 38 models (additive changes only)
- `server/src/index.js` — all route mounts, CORS allowlist, starts the push scheduler
- `client/src/App.jsx` — all routes + redirects of retired pages
- `client/src/i18n/translations.js` — every UI string, EN + HI (~4,400 lines — grep the namespace first)
- `client/src/components/ui/` — shared primitives: `Button`, `Card`, `PageHeader`, `SectionLabel`, `SaveStatus`
- `client/src/components/HelplineList.jsx` + `client/src/constants/helplines.js` — iCall 9152987821 · KIRAN 1800-599-0019 · 112
- `client/tailwind.config.js` / `client/src/index.css` — design tokens + theme system
- `client/src/api.js` — `apiFetch()` returns the raw Response; always `.then(r => r.json())`

## 4. DATABASE MODELS (38)

Additive changes only — never drop/rename. User has 30 relations; all cascade on user delete except as noted.

- **Core:** `User` (incl. `dateOfBirth`, `guardianEmail`, `guardianConsentAt`, `pilotAccessUntil`, `lastActiveAt`, `lastSeenAt`, legacy `ritualName/ritualSteps`, `cueWord*`), `ChatSession`, `Message`, `UserMemory`, `PasswordResetToken`
- **Coaching loop:** `UserCoachingState`, `CoachingCycle`, `Prescription`, `ActiveCoachingSelection` (Restrict FKs to cycle/prescription), `CurrentCoachingFocus`, `Plan`, `PlanSession`, `SkillProgress`
- **Onboarding/profile:** `OnboardingSession`, `ActiveOnboardingSession`, `StartingPerformanceProfile`, `StartingProfileWording`
- **Tools & records:** `MindJournalEntry`, `ToolReport`, `SelfTalkCard`, `BodyResetSession` (Pressure Reset), `Routine` + `RitualLegacyImport` (Ritual), `Debrief`, `GameSession`, `WeeklyReport`
- **Safety & ops:** `SafetyEvent` (structured fields only, no message content; founder review status), `ProcessedWebhookEvent` (Razorpay dedup), `PilotCommunication` + `Target` + `Response`, `PushNotificationPreference`, `PushSubscription`, `FounderEmailCampaign`, `FounderEmailDelivery`
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
| `/api/sessions` | list/create, end-stale, :id/messages, :id/end, PATCH/DELETE :id | AI summaries; Consent on end/end-stale, no Access |
| `/api/onboarding` | GET/PATCH session, POST session/complete | |
| `/api/profile` | GET starting, POST confirm, PATCH current-focus, PATCH answers, POST start-chat | AI wording of the starting profile; Consent on start-chat |
| `/api/profile-intro` | GET | Retired AI surface — fixed welcome text for old clients; Consent |
| `/api/plan` | GET current, POST generate, PATCH session/:id/complete | |
| `/api/prescriptions` | POST claim-opener, POST :id/complete, GET active | Consent |
| `/api/skills` | GET :skillKey, POST :skillKey/learn, POST :skillKey/quick-check | |
| `/api/mental-rep` | POST complete | Quick Rep |
| `/api/mind-journal` | POST, GET, PATCH context, GET/DELETE :id | AI reflection review; Consent on read/write |
| `/api/playbook` | GET | Playbook UI retired (redirects to Home) |
| `/api/weekly-reports` | GET (lazy-generates last week) | AI; Consent, no Access |
| `/api/debrief` | POST, GET | AI; Consent, no Access (UI retired → redirect) |
| `/api/self-talk` | POST generate, save, GET cards, PATCH/DELETE cards/:id, POST cards/:id/practice | Consent + **Access** on generate |
| `/api/body-reset` | POST arjun-note, save, GET, DELETE :id | Pressure Reset; Consent + **Access** on arjun-note |
| `/api/routines` | GET, POST, GET/PATCH/DELETE :id, POST import-legacy, POST suggest | Ritual UI. No AI. `suggest` = deterministic rules (EN+HI), computes only. Saves are safety-screened |
| `/api/ritual` | GET/POST me | Legacy single ritual, no current UI caller (cached old clients); safety-screened; mirrors the linked routine |
| `/api/games` | POST xp, POST session, GET status | Focus Lock / Reset Rally |
| `/api/progress` · `/api/achievements` · `/api/streaks` | GET summary · GET me · POST freeze | Legacy; Progress UI retired |
| `/api/user` | DELETE data/:type | 6 types: chat-history, reflections, mental-profile, cue-word, checkin-history (MentalFitnessEntry + CheckIn), routines |
| `/api/payments` | POST webhook (public, HMAC), create-subscription, GET status, POST cancel | |
| `/api/safety` | POST event | client-detected safety events (Pressure Reset keyword hit); metadata only |
| `/api/activity` | POST presence | heartbeat for "Live now / Seen X ago" |
| `/api/pilot-communications` | GET next, POST :id/seen · dismiss · not-now · respond | in-app founder messages |
| `/api/push-notifications` | GET/PATCH preferences, POST subscribe, POST unsubscribe | |
| `/api/contact` | POST | public, rate-limited |
| `/api/founder/*` | auth (login/session), pulse, safety-events (list/get/review), pilot-overview, pilot-access (grant/revoke), pilot-communications, email (athletes/test/send/list), push-test | **founder auth** (`founderAuthenticate`), not athlete JWT |
| `/api/health` | GET | public |

**AI endpoints without the Access check** (fine while the pilot is free; revisit before paid launch): session summaries, weekly-reports, debrief, Mind Journal review, starting-profile wording.

## 6. ENV VARIABLES

**Railway (backend):** `DATABASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `JWT_SECRET` (never rotate in prod), `PORT`, `CLIENT_URL` (comma-separated extra CORS origins + password-reset links), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CONTACT_TO_EMAIL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `FOUNDER_PIN`, `FOUNDER_TOKEN`, `FOUNDER_SESSION_SECRET`, `FOUNDER_DASHBOARD_URL` (CORS for the dashboard), `FOUNDER_TEST_EMAIL`

**Vercel (client):** `VITE_API_URL`, `VITE_RAZORPAY_KEY_ID`, `VITE_VAPID_PUBLIC_KEY`

`GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL` appear only in dead `config/passport.js`. No Twilio/WhatsApp/Sentry/PostHog code exists.

CORS is an allowlist (production domains + `CLIENT_URL` + `FOUNDER_DASHBOARD_URL` + this project's Vercel preview pattern) — not allow-all.

## 7. DESIGN SYSTEM — CALM CLARITY

- Primary deep blue; tailwind `brand.500` = `#1769AA`. Accent amber. Font **Poppins**.
- Theme: light default → `prefers-color-scheme` auto-dark → manual `[data-theme]` on `<html>` → `localStorage arjun_theme`. Dark tokens are `--dark-*` CSS vars (`bg-dark-900`, `text-ink`, `text-slt`).
- Stage 3 UI foundation: use `components/ui` primitives, type tokens (`text-display/title/heading/body/caption/micro`), `px-page`. Flat cards by default; at most one gradient "hero" per screen (`card-hero`, `TrainGradientCard`, `GradientIconTile`). Tap targets ≥ 44px; visible focus rings.
- Purple `#8B5CF6` remains only in `GradientIconTile` and `SelfTalkPage`.
- VisualizationPage keeps a hardcoded palette — intentional.

## 8. ATHLETE SURFACES

Bottom nav: **Home** (`/dashboard`) · **Train** (`/train`) · **Coach** (`/coaching`, nav hidden inside chat) · **Profile** (`/starting-profile`). Account settings at `/account`.

| Surface | Route | Notes |
|---|---|---|
| Coach | `/coaching` | Main chat (see §9) |
| Mind Journal | `/mind-journal` (+ `/quick`, `/new`, `/new/details`, `/context`, `/:id`) | Guided reflections + quick notes; replaces debrief, check-in and mental-fitness |
| Starting profile | `/starting-profile` (+ `/check-in`) | Onboarding performance profile |
| Ritual | `/ritual` | Up to 5 routines: list → detail (steps, when-to-use tip, "Talk to Arjun" prefill) → builder with "Suggest steps for me". No in-app walkthrough |
| Pressure Reset | `/body-reset` (+ `/history`) | Shared practice shell |
| Quick Rep | `/mental-rep` | Delivers prescribed practices |
| Focus Card Builder / Focus Deck | `/self-talk`, `/focus-deck` | Max 5 active cards (server-enforced) |
| Skill paths | `/skills/focus-self-talk`, `/skills/pressure-reset` | Learn + quick check |
| Games | `/games/focus-lock`, `/games/reset-rally` | `/games` → `/train` |
| Visualization | `/visualization` | |
| Weekly reviews | `/weekly-reviews` | |

Retired → redirects: `/bounce-back`, `/before-you-play`, `/games` → `/train`; `/breathing` → `/body-reset`; `/checkin` → `/mental-fitness` → `/mind-journal`; `/debrief` → journal (or reflection flow with a prescription); `/playbook`, `/progress` → `/dashboard`; `/mental-game-profile` → `/starting-profile`.

## 9. CHAT ARCHITECTURE

- Main chat: `POST /api/chat/message` runs a **buffered** Anthropic tool loop (`services/coaching/bufferedToolLoop.js`, non-streaming, ≤1 coaching-state transition per turn), then sends the reply over SSE; the client reveals it progressively.
- Coaching loop (spec §2): diagnose → **one** prescription at a time → follow-up on next open. Tools/state in `services/coaching/`.
- Quick replies come as structured data from the coaching tools (SSE `quick_replies` event). `[SUGGEST:]` text tags are retired. `[APP:tool]` tags still render as tool cards (`parseArjunMessage.js`).
- Every message is first screened by the deterministic safety screen (`screenSafetyText`) before any AI call; flagged → fixed guidance + `SafetyEvent`, no AI.
- Quick chat: **dormant** — server code remains (minimal prompt, own safety blocks) but the client never enables it.
- Context: last 3 ToolReports from the past 7 days (excluding debrief), memories, plan, focus cards, coaching context. Memory extraction is a separate `messages.create`.
- ⚠️ No retention job: messages are never deleted on a schedule. The only background job is the push scheduler.

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
4. Coach only sees the **imported** legacy routine (via `User.ritualName/ritualSteps`); other routines reach Arjun only when the athlete taps "Talk to Arjun" (prefill). Automatic context needs a `buildSystemPrompt` change + founder approval.
5. Old docs (`AUDIT.md`, `PROJECT.md`, `PRODUCT-AUDIT.md`, `PLAN.md`) are stale.

Fixed since the July audit: quick-chat safety (now dormant + own safety blocks), age/guardian consent gate, safety-event logging + founder review, `checkin-history` deletion, broken `--color-dark-*` vars, webhook idempotency, CORS allow-all, KIRAN on all safety surfaces.

## 14. CODING PATTERNS

- Routes: `express.Router()` + `authenticate` sets `req.userId`. Newer routes use a factory (`createXRouter({ store, ... })`) so tests can inject fakes.
- Claude: non-streaming `messages.create`, strip markdown fences before `JSON.parse`; new `Anthropic({ apiKey })` per request. Main chat via the buffered tool loop.
- Any athlete-written text that is saved or sent to AI goes through the deterministic safety screen first (persist nothing when flagged; record a `SafetyEvent`; return fixed guidance).
- ToolReports: `prisma.toolReport.create({ toolType, summary, arjunResponse, details: JSON.stringify({...}) })` on tool completion.
- XP: `awardXP(userId, amount)` in gamification.js (legacy inline `xp: { increment }` remains in chat.js/debrief.js). XP is invisible to athletes — build no new gamification.
- Translations: `translations[language].namespace.key` — every new string in BOTH `en` and `hi`; no hardcoded copy in JSX.
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
