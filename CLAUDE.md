# Arjun — CLAUDE.md

Read at the start of every session. Reflects the codebase as of 2026-07-02 (source of truth: `AUDIT.md`, same date).

---

## 1. PROJECT

- App: **Arjun** — AI mental performance coaching for young Indian athletes (14–25). Sports psychologist in your pocket, not therapy.
- Live URL: `coacharjun.in`
- Solo non-technical founder. India market. ₹299/month.

## 2. TECH STACK

- Frontend: React 18 + Vite 5 + Tailwind 3.4 (`lucide-react`, `recharts`, `html-to-image`, `vite-plugin-pwa`) → deploys to **Vercel**
- Backend: Node.js + Express 4 → deploys to **Railway** (`npm start` runs `prisma db push` first)
- DB: PostgreSQL via Prisma 5.7
- AI: Claude API (`@anthropic-ai/sdk` 0.104). Model: `process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'`
- Payments: Razorpay (`razorpay` 2.9.6) — checkout + webhook live
- Email: Resend 4.8. Auth: JWT + bcrypt (no OAuth)
- Branch: `claude/mindgame-setup-auth-m3cxg6` — always commit here, never push to main

## 3. KEY FILES

- `server/src/routes/chat.js:118` — `buildSystemPrompt()` — Arjun's brain
- `server/src/routes/auth.js:14` — `SAFE_SELECT` — user fields safe to return
- `client/src/i18n/translations.js` — every UI string, EN + HI
- `server/prisma/schema.prisma` — DB models (additive changes only)
- `server/src/index.js` — all route registrations (no cron jobs exist)
- `client/src/App.jsx` — all 30 routes
- `client/tailwind.config.js` — design tokens (dark-* bound to CSS vars)
- `client/src/index.css` — theme system (light default, `[data-theme]` overrides)
- `client/src/hooks/useTheme.js` — theme persistence (`localStorage arjun_theme`)
- `client/src/utils/parseArjunMessage.js` — `[APP:]` tag → tool card parsing
- `client/src/api.js` — `apiFetch()` — returns raw Response; always `.then(r => r.json())`
- `server/src/services/gamification.js` — `awardXP`, achievement checks
- Route files (from index.js): auth, chat, checkin, progress, achievements, drills, ritual, debrief, games, profileIntro, sessions, cue, userData, streaks, payments, mentalFitness, weeklyReports, selfTalk, bodyReset

## 4. DATABASE MODELS

All 14 User relations confirmed `onDelete: Cascade`. Additive changes only — never drop/rename.

- `User` — id, email, password (bcrypt), tier, trialStarted, language, sport, position, goals, xp, streakFreezeCount, cueWord*, ritual*, age, ocean*
- `CheckIn` — userId, mood/focus/confidence (1–5), energy, sleep, reflection, gratitude, type
- `Message` — userId, role, content, sessionType, chatSessionId (⚠️ no index — AUDIT AMBER 7)
- `ChatSession` — userId, sessionType, mode ("main"|"quick"), title, summary, status
- `UserMemory` — userId, memKey, value (unique per userId+memKey)
- `UserAchievement` — userId, key (badge defs live in `gamification.js:7-17`, 9 badges)
- `DrillCompletion` — userId, drillIndex (server-only; no client caller)
- `Debrief` — userId, wentWell, doDifferently, nextFocus, arjunInsight, mode, chips
- `GameSession` — userId, gameType, score
- `PasswordResetToken` — userId, token, expiresAt, used
- `MentalFitnessEntry` — userId, date (IST string), mood + 6 dims (1–5), arjunResponse (unique per userId+date)
- `ToolReport` — userId, toolType, summary, arjunResponse, details (JSON string)
- `WeeklyReport` — userId, weekStart, content (unique per userId+weekStart)
- `SelfTalkCard` — userId, focusWord, resetWord, powerLine, performanceReminder, arjunNote, isMatchDayCard, matchDayContext
- `BodyResetSession` — userId, mode, feeling, context, focusWordUsed, tension/readiness before+after, arjunNote

**INERT fields (never written — do not rely on):** `googleId`, `reminderOptIn`, `phone`, `razorpayCustomerId`, `avatar` (server-side), `subscriptionEndDate` (write-only), `oceanO–N` (no test UI exists; the one reader in bounce_back wizard doesn't even select them — AUDIT AMBER 6).

## 5. API ROUTES

All require auth (JWT via `authenticate` → `req.userId`) except where marked. **Trial gate exists on exactly ONE route — AUDIT RED 2.**

| Method + Path | Purpose | Auth | Trial gate |
|---|---|---|---|
| POST /api/auth/register | Create account | no | — |
| POST /api/auth/login | Sign in | no | — |
| GET /api/auth/me | Current user (SAFE_SELECT) | yes | no |
| PATCH /api/auth/me/language | Toggle EN/HI | yes | no |
| PATCH /api/auth/me/onboarding | Save onboarding | yes | no |
| PUT /api/auth/me/profile | Update profile (age 8–80) | yes | no |
| DELETE /api/auth/account | Full account deletion | yes | no |
| POST /api/auth/logout · forgot-password · reset-password | Auth flows | no | — |
| GET /api/chat/messages · /usage | History / trial days left | yes | no |
| **POST /api/chat/message** | Main chat (SSE streaming) | yes | **YES — only gated route** |
| POST /api/chat/wizard | Bounce-back / viz / cue AI flows | yes | **no (leak)** |
| GET/POST /api/checkin* | Legacy check-in (no client caller) | yes | no |
| GET /api/progress/summary | Charts, streak, fitness score | yes | no |
| GET /api/achievements/me | Earned badges | yes | no |
| GET /api/drills/today · POST /complete | Daily drill (orphaned, no client) | yes | no |
| GET/POST /api/ritual/me | Pre-match routine | yes | no |
| POST/GET /api/debrief | Match review + AI insight | yes | **no (leak)** |
| POST /api/games/xp | Record GameSession +10 XP | yes | no |
| GET /api/profile-intro | AI profile intro (cached) | yes | **no (leak)** |
| GET/POST /api/sessions · /end-stale · /:id/messages (?since) · /:id/end · PATCH·DELETE /:id | Chat session CRUD + summaries | yes | **no (leak on summaries)** |
| PATCH /api/user/cue-word | Save cue word (+ToolReport) | yes | no |
| DELETE /api/user/data/:type | Selective deletion (5 types — RED 3 bug) | yes | no |
| POST /api/streaks/freeze | Use streak freeze | yes | no |
| POST /api/payments/webhook | Razorpay events (HMAC-verified) | no (signature) | — |
| POST /api/payments/create-subscription · GET /status · POST /cancel | Subscription mgmt | yes | no |
| POST /api/mental-fitness · GET /today · /week | MFS check-in + AI line | yes | **no (leak)** |
| GET /api/weekly-reports | Lazy-generates last week's report | yes | **no (leak)** |
| POST /api/self-talk/generate · /save · GET /cards · PATCH·DELETE /cards/:id · POST /cards/:id/practice | Self-Talk Builder + Focus Deck | yes | **no (leak on generate)** |
| POST /api/body-reset/arjun-note · /save · GET / · DELETE /:id | Body Reset | yes | **no (leak on arjun-note)** |
| GET /api/health | Health check | no | — |

## 6. ENV VARIABLES

**Railway (backend):**
- `DATABASE_URL` — PostgreSQL connection
- `ANTHROPIC_API_KEY` — Claude key
- `ANTHROPIC_MODEL` — model override (default claude-haiku-4-5-20251001)
- `JWT_SECRET` — token signing; never rotate in prod
- `CLIENT_URL` — password-reset email links only (⚠️ NOT used for CORS — CORS is `origin: true` allow-all, index.js:27 — AUDIT AMBER 8)
- `PORT` — default 5000
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — transactional email
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY` — payments

**Vercel (frontend):**
- `VITE_API_URL` — backend base URL (api.js:1)
- `VITE_RAZORPAY_KEY_ID` — public checkout key (PricingPage.jsx:54)

**Stubs only — SDK NOT installed, no code references:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`, `SENTRY_DSN`, `POSTHOG_KEY`.

## 7. DESIGN SYSTEM — CALM CLARITY

- Primary: `#185FA5` deep blue — ⚠️ tailwind `brand.500` is `#1769AA` (mismatch); screens hardcode `#185FA5` directly — AUDIT AMBER 15
- Accent: `#E2711D` amber
- Background: white — **light is the default theme**
- Font: **Poppins** (index.css:132, tailwind fontFamily)
- Theme: light default → `@media prefers-color-scheme` auto-dark → manual `[data-theme]` override on `<html>` → `localStorage arjun_theme` (useTheme.js)
- ⚠️ Purple `#8B5CF6` still in config and used on Dashboard, TrainPage, SelfTalkPage, LandingPage — unresolved drift (AMBER 15)
- BounceBackPage: always-dark hardcoded palette — **intentional** (emotional design)
- VisualizationPage: hardcoded light palette + always-dark step 4 — **intentional**
- ⚠️ `--color-dark-600/700/800` referenced in MentalFitnessCheckin + BeforeYouPlayPage are UNDEFINED — use `--dark-*` (RED 4)

## 8. MENTAL TOOLS

| Tool | Route | ToolReport | Status |
|---|---|---|---|
| Breathing (Calm Body) | `/breathing` | no — XP only (games.js) | 🟢 |
| Body Reset | `/body-reset` (+`/body-reset/history`) | yes — bodyReset.js:97 | 🟢 |
| Bounce Back | `/bounce-back` | yes — chat.js:996 (wizard) | 🟢 (no trial gate) |
| Before You Play | `/before-you-play` | yes — cue.js:37 | 🟡 broken CSS vars (RED 4) |
| After the Match / Debrief | `/debrief` | yes — debrief.js:225 | 🟢 (no trial gate) |
| Visualization | `/visualization` | yes — chat.js:957 (wizard) | 🟡 hardcoded palette |
| Self-Talk Builder + Focus Deck | `/self-talk`, `/focus-deck` | yes — selfTalk.js:149 | 🟡 KIRAN missing on safety screen; cards reach coaching only via ToolReport line |

All tools: intro screen → flow → back/quit lands on `/train`. Max 5 active SelfTalkCards (server-enforced).

## 9. CHAT ARCHITECTURE

- Main chat: persistent; SSE streaming (`anthropic.messages.stream`, chat.js:739); loads last 7 days via `?since` query filter — **NO retention job exists anywhere; nothing is ever deleted on a schedule** (AMBER 3)
- Quick chat: separate mode, minimal prompt, 7-day history cap, no ToolReports; "zero-footprint" is intent only — messages persist server-side; cleanup is a best-effort client DELETE on tab-hide + purge on next quick start; killed browser = messages persist (AMBER 3)
- Session types: 8 `SESSION_INSTRUCTIONS` in chat.js:75-114 but client always sends `sessionType='general'` — topic variants unreachable (dead code)
- `[APP:tool]` tags: working — parsed in parseArjunMessage.js, rendered as tap-to-open tool cards, max 2/reply
- `[SUGGEST:]` chips: client renders them as tappable quick-reply buttons under the last assistant message (`ChatPage.jsx`'s `extractSuggestions()` + `showChips` block); prompt asks for them on most (not every) reply, with specific non-generic options, skippable when nothing fits
- Weekly reports: lazy — generated on Progress page load if last week missing + ≥3 user messages; no Monday cron (AMBER 10)
- Memory extraction: separate non-streaming `messages.create` (chat.js:495)

## 10. SAFETY RULES

- Main chat: crisis (chat.js:440-464) + injury (chat.js:416-438) blocks, EN + Hinglish, iCall 9152987821 + 112, "safety overrides everything" — CONFIRMED WORKING
- **Quick chat: NO SAFETY COVERAGE AT ALL (chat.js:122-139) — RED 1, fix before anything else**
- Safety events: never logged or persisted anywhere — founder cannot review incidents (AMBER 2)
- KIRAN 1800-599-0019: present ONLY in Body Reset safety screen; missing from chat + Self-Talk (AMBER 1)
- Self-Talk safety screen: iCall only
- Detection is prompt-only (LLM instruction), except Body Reset/Self-Talk client-side keyword checks

## 11. PAYMENT RULES

- Tier upgraded ONLY inside webhook `subscription.activated` (payments.js:38) — no client-callable upgrade path
- Webhook: HMAC-SHA256 over raw body, wired before `express.json()` (index.js:23) ✓
- `RAZORPAY_KEY_SECRET`: never sent to frontend, never logged ✓
- ⚠️ Webhook NOT idempotent — no event-ID dedup; replayed `subscription.charged` resets start date (AMBER 4)
- ⚠️ Account deletion: Razorpay cancel runs FIRST but failure is swallowed — live sub can survive with no user (auth.js:252-254, AMBER 5)
- Trial: 14 days from `trialStarted` (fallback createdAt), 429 `TRIAL_ENDED` — **gates ONLY POST /api/chat/message; 8 other AI endpoints ungated (RED 2)**

## 12. DELETION RULES

Full account deletion (`DELETE /api/auth/account`) — confirmed correct order:
1. Read user (id, name, email, razorpaySubscriptionId)
2. Razorpay cancel (`cancel_at_cycle_end: false`)
3. Delete Messages, then ChatSessions (Message→ChatSession has no cascade)
4. `user.delete()` — cascade covers all 14 relations, no orphans
5. Audit log + confirmation email

Selective deletion (`DELETE /api/user/data/:type`, 5 types) — **KNOWN BUG (RED 3):**
- `checkin-history` deletes `MentalFitnessEntry` ONLY; `CheckIn` rows (incl. reflection + gratitude free text) survive and keep feeding the prompt
- Fix when authorized: also `prisma.checkIn.deleteMany({ where: { userId } })` in the same handler (userData.js:59)
- Note: no selective option touches ToolReport / SelfTalkCard / BodyResetSession

## 13. KNOWN BUGS (fix before marketing)

1. Quick chat no safety — `chat.js:122-139`
2. Trial gate missing on 8 AI endpoints — only `chat.js:582` gated
3. Selective deletion deletes wrong table — `userData.js:59`
4. Broken CSS vars — `MentalFitnessCheckin.jsx:173,174,220,221` + `BeforeYouPlayPage.jsx:531,772,773,823,824` reference undefined `--color-dark-600/700/800` (should be `--dark-*`)
5. No parental consent / no age gate at signup — minors product, DPDP exposure

## 14. CODING PATTERNS

- Routes: `express.Router()` + `authenticate` middleware sets `req.userId`; `new PrismaClient()` per route file
- Claude: main chat = `anthropic.messages.stream` + SSE; everything else = non-streaming `messages.create` with markdown-fence stripping before `JSON.parse`; new `Anthropic({ apiKey })` per request
- ToolReports: `prisma.toolReport.create({ toolType, summary, arjunResponse, details: JSON.stringify({...}) })` on tool completion; consumed in buildSystemPrompt (last 3, chat.js:678)
- XP: central `awardXP(userId, amount)` in gamification.js (some legacy inline `xp: { increment }` in chat.js/debrief.js/cue.js)
- Translations: `translations[language].namespace.key` — every new string in BOTH `en` and `hi`; no hardcoded strings in JSX
- Theme: `useTheme()` sets/removes `data-theme` on `<html>`; components use semantic tokens (`bg-dark-900`, `text-ink`, `text-slt`)
- Frontend fetch: `apiFetch(path, init)` returns raw Response — ALWAYS chain `.then(r => r.json())`
- New page: create in `client/src/pages/`, add `<Route>` in App.jsx (BottomNav for library pages, none for full-screen flows), strings to translations.js
- Build check: `cd client && npm run build` must pass with zero errors before reporting done

## 15. DO NOT TOUCH (without explicit instruction)

- `buildSystemPrompt()` — Arjun's brain (chat.js:118-479)
- Webhook handler payment logic (payments.js:15-81)
- `SAFE_SELECT` (auth.js:14)
- Cascade delete relations in schema.prisma
- Crisis/injury safety blocks in main chat (chat.js:416-472)
- `authenticate` middleware
- Razorpay plan IDs in env
- `calculateStreak()` (gamification.js) and freemium gating logic

## 16. DEAD CODE — DO NOT USE

- `server/src/config/passport.js` — never required; passport deps not installed; importing it crashes
- `client/src/data/drills.js` — never imported
- `checkChatAchievements` (gamification.js:119) — exported, never called
- Translation namespaces `pressureReset`, `wizard`, `games` — zero references
- `SESSION_INSTRUCTIONS` topic variants (chat.js:75-114) — client always sends 'general'
- `POST /api/checkin` — no client caller (model kept alive by mentalFitness dual-write only)
- `.claude/worktrees/` — two stale outdated app copies; ignore entirely

## 17. TOKEN DISCIPLINE

- grep/search before reading full files; read only the section needed
- translations.js is ~2,500 lines — always grep for the namespace first
- List changed files + one-line summaries when reporting back
- Confirm `npm run build` passes before reporting done
- Use Plan Mode for any multi-file change

---

*Keep this file accurate. Update it when features ship, bugs in §13 are fixed, or key files move.*
