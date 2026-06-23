# MindGame / Arjun — CLAUDE.md

AI assistant reference file. Read this at the start of every session.

---

## 1. WHAT THIS APP IS

**MindGame** is an AI mental performance coaching app for young Indian athletes (14–25). The AI coach is named **Arjun**, powered by the Claude API. Think sports psychologist in your pocket — not therapy. Solo non-technical founder. India market. ₹299/month. The product URL is `coacharjun.in`.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS (Lucide React icons, Recharts charts) |
| Backend | Node.js + Express 4 |
| Database | PostgreSQL via Prisma ORM (`@prisma/client` 5.7) |
| AI | Claude API (`@anthropic-ai/sdk` 0.104). Model: `process.env.ANTHROPIC_MODEL \|\| 'claude-haiku-4-5-20251001'`. Configurable via env var — no code change needed to swap model. |
| Email | Resend (`resend` 4.8) |
| Payments | Razorpay — **integration pending**. API keys not yet obtained. |
| PWA | `vite-plugin-pwa` 1.3 — installed and configured. |
| Auth | JWT (`jsonwebtoken`) + bcrypt passwords. No OAuth. |

**Live URLs:** Check Railway dashboard (server) and Vercel dashboard (client) — not stored in codebase.

**Local dev:**
```bash
# Backend (port 5000)
cd server && npm install && npm run dev

# Frontend (port 5173)
cd client && npm install && npm run dev

# DB browser
cd server && npx prisma studio
```

---

## 3. GIT

- **Working branch:** `claude/mindgame-setup-auth-m3cxg6`
- **Remote:** `bittukamal-spec/AI-mental-coach-` (GitHub)
- **Rule:** Always commit to the working branch above. Never push to `main` directly.
- **Deploy:** Push to branch → Railway auto-deploys server, Vercel auto-deploys client.
- **Schema changes:** `prisma db push` runs automatically on server start (`npm start`).

---

## 4. KEY FILES

| File | Purpose |
|---|---|
| `server/src/routes/chat.js:123` | `buildSystemPrompt()` — Arjun's brain. Assembles full AI context from user profile, check-ins, memories, session type. **Most complex file. Never change data sources without understanding full impact.** |
| `client/src/i18n/translations.js` | Every user-facing string in EN + HI. **All new strings must be added here in both languages.** Access via `translations[language].section`. |
| `server/prisma/schema.prisma` | DB models. **All changes must be additive only — never drop or rename existing columns.** |
| `client/src/App.jsx` | All frontend routes. Protected routes use `<ProtectedRoute>` + `<BottomNav />`. |
| `server/src/routes/auth.js:14` | `SAFE_SELECT` — controls which user fields are returned to frontend. Never expose `password`. Never add a sensitive field without thinking twice. |
| `server/src/index.js` | Express entry point. All route registrations here. |
| `server/src/services/gamification.js` | XP awards, achievement checks, `calculateStreak()`. |
| `client/src/api.js` | `apiFetch(path, init)` — fetch wrapper with base URL auto-detection. Use this everywhere instead of raw `fetch`. |
| `client/src/contexts/AuthContext.jsx` | Provides `{ user, token, language, login, logout, updateUser }` to all components. |

---

## 5. ENV VARS

All defined in `server/.env.example`. Copy to `server/.env` for local dev.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Railway provides this in prod) |
| `ANTHROPIC_API_KEY` | Claude AI key — get from console.anthropic.com |
| `ANTHROPIC_MODEL` | Model override. Default: `claude-haiku-4-5-20251001`. Change here, redeploy — no code change needed. |
| `JWT_SECRET` | Long random string (64+ chars) used to sign login tokens. Never change in production. |
| `CLIENT_URL` | Frontend URL — used for CORS allow-list and password reset email links |
| `PORT` | Server port (default `5000`) |
| `RESEND_API_KEY` | Resend transactional email key |
| `RESEND_FROM_EMAIL` | From address for emails — must be verified on resend.com |
| `TWILIO_ACCOUNT_SID` | Twilio WhatsApp sandbox SID (optional, Sprint 2) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_NUMBER` | Twilio WhatsApp sender (sandbox: `whatsapp:+14155238886`) |
| `META_WHATSAPP_TOKEN` | Meta Cloud API token — production WhatsApp alternative |
| `META_WHATSAPP_PHONE_ID` | Meta Cloud API phone ID |
| `SENTRY_DSN` | Sentry error monitoring DSN (not yet integrated in code) |
| `POSTHOG_KEY` | PostHog analytics key (not yet integrated in code) |

> **Note:** `SENTRY_DSN` and `POSTHOG_KEY` are in `.env.example` but SDK integration code has not been added yet.

---

## 6. HOW TO ADD A NEW PAGE (frontend)

1. Create `client/src/pages/NewPage.jsx`
2. Import it in `client/src/App.jsx` and add a `<Route>`:
   ```jsx
   import NewPage from './pages/NewPage';
   // Inside <Routes>:
   <Route path="/new" element={
     <ProtectedRoute requireOnboarding={true}>
       <NewPage />
       <BottomNav />
     </ProtectedRoute>
   } />
   ```
   Omit `<BottomNav />` for full-screen flows (e.g. onboarding, personality test).
3. Add all new user-facing strings to `client/src/i18n/translations.js` in both `en` and `hi`.

---

## 7. HOW TO ADD AN API ROUTE (backend)

1. Create `server/src/routes/newRoute.js`:
   ```js
   const express = require('express');
   const { PrismaClient } = require('@prisma/client');
   const authenticate = require('../middleware/authenticate');
   const router = express.Router();
   const prisma = new PrismaClient();

   router.get('/', authenticate, async (req, res) => {
     // req.userId is set by authenticate middleware
     res.json({ ok: true });
   });

   module.exports = router;
   ```
2. Register it in `server/src/index.js`:
   ```js
   app.use('/api/new', require('./routes/newRoute'));
   ```
3. Call it from the frontend using `apiFetch('/api/new', { headers: { Authorization: \`Bearer \${token}\` } })`.

---

## 8. CORE RULES (always follow)

- **Never touch** `calculateStreak()`, payment/freemium gating logic, or `buildSystemPrompt()` data sources without explicit instruction.
- **Every new user-facing string** goes in `translations.js` in **both** `en` and `hi`. No hardcoded English strings in JSX.
- **All schema changes are additive only.** Never drop or rename existing columns.
- **Run `npm run build` in `client/` and confirm zero errors** before reporting a task done.
- **List changed files + one-line summaries** when reporting back.
- **Search/grep before reading full files** — preserve context window.
- Use `apiFetch` not raw `fetch`. Use `SAFE_SELECT` in every user query. Add `authenticate` on every protected route.

---

## 9. CURRENT STATE — WHAT'S BUILT

| Feature | Status |
|---|---|
| Auth | Register, login, JWT, password reset (email via Resend), language toggle (EN/HI) |
| Onboarding | 5-step wizard (sport → level → challenge → pressure → goals) + Mental Game Profile results screen (AI-generated, cached) |
| Daily check-in | Mood / Focus / Confidence (1–5), optional reflection + gratitude. One per UTC day. Always unlimited. |
| AI coaching (Arjun) | Chat with session types, reply style selector, focus dropdown, session history, session summaries, delete sessions. Free 14-day trial → premium only. |
| Progress | Streak tracking, 7/30-day chart, weekly averages vs prev week, Mental Fitness Score (0–100), shareable progress card (PNG via `html-to-image`) |
| Streak freeze | Freeze mechanic — use a freeze to backdate a check-in to yesterday. Earn 1 freeze per 7-day milestone (capped at 2). |
| Gamification | Mental XP (MXP), 9 achievement badges, Daily Drill (rotates by day), drill completions tracked |
| Mental tools | Breathing page, Pressure Reset wizard (5-step), Pre-match ritual builder, Post-match debrief |
| Games | Reaction Ball (3 difficulty levels + No-Go), Stroop, Focus Grid, Thought Filter, Mental Reset |
| Personality test | OCEAN Big Five (stored on User model) |
| Dashboard | Greeting + stat pills (streak / MXP / fitness score) with tappable info sheets, Today check-in card, Training Streak card (with freeze UI), Coach card, Today's Drill, Mental Tools grid |
| Compliance | Privacy policy, Terms, Refund policy, AI disclosure, safety signpost |
| PWA | Installed — add to home screen supported |

---

## 10. WHAT'S PENDING

- **Razorpay payment integration** — API keys pending approval. Paywall logic exists (`checkFreeLimit()` in `chat.js`), payment button is a placeholder.
- **WhatsApp reminders** — phone collection UI + daily 8:30 PM IST cron if no check-in. Twilio/Meta env vars ready.
- **PostHog analytics** — env var ready, SDK not integrated.
- **Sentry error monitoring** — env var ready, SDK not integrated.
- **Parent/coach progress snapshot** — planned, not started.
- **Fear of injury + patience content** — planned, not started.
- **Weekly Sunday insight email from Arjun** — not built.

---

## 11. PRICING

| Tier | Access | Price |
|---|---|---|
| Free trial | Full access for 14 days from registration | ₹0 |
| Premium monthly | Unlimited forever | ₹299/month |
| Premium annual | Unlimited forever | ₹1,999/year |

- **Check-ins:** Always unlimited — no paywall, ever.
- **Chat with Arjun:** Free for 14 days (`TRIAL_DAYS = 14` in `chat.js`), then premium only. Trial gate lives in `checkFreeLimit()` middleware in `chat.js`.
- **Payment processor:** Razorpay (integration pending — no code yet).

---

## 12. DB MODELS (quick reference)

| Model | Key fields |
|---|---|
| `User` | id, email, name, tier, trialStarted, language, sport, experienceLevel, goals (JSON), xp, streakFreezeCount, lastFreezeUsedAt, OCEAN fields, profileIntro |
| `CheckIn` | userId, mood, focus, confidence, energy, sleep, reflection, gratitude, type ("checkin"\|"freeze") |
| `Message` | userId, role, content, sessionType, chatSessionId |
| `ChatSession` | userId, sessionType, title, summary, status ("active"\|"ended") |
| `UserMemory` | userId, memKey, value, source — unique per (userId, memKey) |
| `UserAchievement` | userId, key — unique per (userId, key) |
| `Debrief` | userId, wentWell, doDifferently, nextFocus, arjunInsight |
| `GameSession` | userId, gameType, score |
| `DrillCompletion` | userId, drillIndex, completedAt |
| `PasswordResetToken` | userId, token, expiresAt, used |

---

*Keep this file accurate. Update it when new features ship or key files move.*
