# MindGame — CLAUDE.md

AI assistant reference file. Read this at the start of every session.

## What This App Is

**MindGame** is an AI mental performance coaching app for Indian athletes. The AI coach is named **Arjun**. It's not therapy — it's performance psychology (like having a sports psychologist in your pocket for ₹299/month).

Target users: Indian athletes aged 16–30 (cricket, football, badminton, wrestling, etc.)

**Core value**: Arjun knows your sport, your mental challenges, your recent check-in data, and your long-term patterns. Every conversation is personalised.

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Vercel |
| Backend | Node.js + Express | Railway |
| Database | PostgreSQL | Railway (managed) |
| AI | Claude Haiku (`claude-haiku-4-5-20251001`) | Anthropic API |
| Email | Resend | resend.com |
| Auth | JWT (bcrypt passwords, no OAuth) | — |

**Live URLs**: Check Railway dashboard and Vercel dashboard for current URLs.

---

## Project Structure

```
AI-mental-coach-/
├── CLAUDE.md              ← You are here
├── client/                ← React frontend (deployed to Vercel)
│   ├── src/
│   │   ├── pages/         ← One file per route
│   │   ├── components/    ← Shared UI (Navbar, etc.)
│   │   ├── contexts/      ← AuthContext (user, token, language)
│   │   ├── i18n/          ← translations.js (ALL UI text, en + hi)
│   │   └── api.js         ← apiFetch() helper (base URL auto-detect)
│   └── vite.config.js
└── server/                ← Express backend (deployed to Railway)
    ├── src/
    │   ├── index.js       ← Entry point + middleware setup
    │   ├── routes/
    │   │   ├── auth.js    ← Register, login, onboarding, password reset
    │   │   ├── chat.js    ← AI chat with streaming SSE + memory
    │   │   ├── checkin.js ← Daily check-in (mood/focus/confidence)
    │   │   └── progress.js← Streak + chart data
    │   ├── services/
    │   │   └── email.js   ← Resend email (welcome + password reset)
    │   └── middleware/
    │       └── authenticate.js ← JWT verification middleware
    └── prisma/
        └── schema.prisma  ← Database schema
```

---

## Key Files — What Does What

### `server/src/routes/chat.js`
- **`buildSystemPrompt()`** — Arjun's brain. Assembles the AI system prompt from user profile + recent check-ins + long-term memory. Edit this to change how Arjun behaves.
- **`checkFreeLimit()`** — Middleware that blocks chat for users whose 14-day trial has ended (or who aren't premium).
- **`extractAndStoreMemories()`** — Runs every 5 messages, extracts long-term facts about the athlete using Claude Haiku.
- Trial logic: `TRIAL_DAYS = 14`. Free users get 14 days from `user.trialStarted`. After that, they must upgrade.

### `server/src/routes/auth.js`
- **`SAFE_SELECT`** — Defines exactly which user fields are sent to the frontend. Never return `password`.
- **`/register`** — Creates user, sets `trialStarted = new Date()`, sends welcome email.
- **`/me/onboarding`** — Saves 5-step onboarding data (sport, competition level, experience, challenge, goals).

### `server/src/routes/checkin.js`
- Check-ins are **always unlimited** (no weekly limit). One per UTC day maximum.
- `GET /today` — Returns today's check-in (or null).
- `POST /` — Creates check-in (mood 1-5, focus 1-5, confidence 1-5, optional reflection).

### `client/src/i18n/translations.js`
- **ALL UI text** lives here. Never hardcode strings in components.
- Two keys: `en` and `hi`. Both must be updated together.
- Access in components: `const t = translations[language].section;`

### `client/src/contexts/AuthContext.jsx`
- Provides: `{ user, token, language, login, logout, updateUser }`
- `user` object includes: `id, email, name, tier, trialStarted, sport, experienceLevel, goals, onboardingDone, competitionLevel, primaryChallenge, language`
- `tier` is `"free"` or `"premium"`. `trialStarted` is the trial start DateTime.

---

## Database Schema (Key Models)

```prisma
User {
  id, email, name, password (bcrypt hash)
  tier          String  @default("free")      // "free" | "premium"
  trialStarted  DateTime?                      // set on register; 14-day trial
  language      String  @default("en")        // "en" | "hi"
  // Onboarding:
  sport, experienceLevel, competitionLevel
  primaryChallenge, pressureResponse, goals   // goals = JSON array
  onboardingDone Boolean @default(false)
}

CheckIn { userId, mood, focus, confidence, reflection, createdAt }
Message { userId, role ("user"|"assistant"), content, createdAt }
UserMemory { userId, memKey, value, source }   // long-term memory
PasswordResetToken { userId, token, expiresAt, used }
```

**Important**: The server runs `prisma db push` on startup. Any schema change you commit will be applied to the Railway PostgreSQL on the next deploy. This is safe for additive changes (new nullable columns). For breaking changes, consult the team.

---

## Pricing Model

| Tier | Access | Price |
|---|---|---|
| Free trial | Full access for 14 days from registration | ₹0 |
| Premium monthly | Unlimited forever | ₹299/month |
| Premium annual | Unlimited forever | ₹1999/year (44% off) |
| Academy (B2B) | 20 athletes | ₹2999/month (future) |

**Check-ins**: Always unlimited (no paywall).  
**Chat with Arjun**: Unlimited for 14 days, then premium only.

---

## Development Setup

### Backend (server/)
```bash
cd server
cp .env.example .env    # fill in your values
npm install
npm run dev             # nodemon on port 5000
```

### Frontend (client/)
```bash
cd client
npm install
npm run dev             # Vite on port 5173
```

### Database
```bash
cd server
npx prisma studio       # visual DB browser at localhost:5555
npx prisma db push      # sync schema to DB (safe for additive changes)
```

---

## Git / Deployment

- **Branch**: Always work on `claude/mindgame-setup-auth-m3cxg6`
- **Deploy**: Push to this branch → Railway auto-deploys server, Vercel auto-deploys client
- **No PRs needed** for solo development — push directly to the branch

```bash
git add -p              # review changes before staging
git commit -m "feat: description of what you built"
git push -u origin claude/mindgame-setup-auth-m3cxg6
```

---

## How to Add a New Page (Frontend)

1. Create `client/src/pages/NewPage.jsx`
2. Add route in `client/src/App.jsx` (or wherever routes are defined): `<Route path="/new" element={<NewPage />} />`
3. Add any new translation strings to **both** `en` and `hi` in `translations.js`

## How to Add a New API Route (Backend)

1. Create `server/src/routes/newRoute.js`
2. In `server/src/index.js`, add: `app.use('/api/new', require('./routes/newRoute'));`
3. Add `authenticate` middleware to protect the route: `router.get('/', authenticate, handler)`

---

## Environment Variables

### Railway (server)
All listed in `server/.env.example`. Critical ones:
- `DATABASE_URL` — PostgreSQL connection string (Railway provides this)
- `ANTHROPIC_API_KEY` — Claude AI (console.anthropic.com)
- `JWT_SECRET` — long random string (never change in production)
- `CLIENT_URL` — Vercel frontend URL (for CORS + email links)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` — transactional email

### Vercel (client)
- `VITE_API_URL` — Railway backend URL (e.g. `https://mindgame-server.railway.app`)

---

## Planned Features (Next Sprints)

**Sprint 2 (WhatsApp + Retention)**:
- WhatsApp phone number collection (after first check-in)
- Daily reminder cron (8:30 PM IST if no check-in)
- Weekly Sunday insight email from Arjun
- PWA setup (add to home screen)

**Sprint 3 (Gamification)**:
- Mental XP (MXP) system
- Achievement badges (12 defined)
- Mental Fitness Score (0-100)
- Streak freeze (premium perk)

**Sprint 4 (Deep Product)**:
- Guided breathing exercise page
- Pre-match ritual builder
- Shareable progress card

**Sprint 5 (Payments)**:
- Razorpay subscription integration
- Admin dashboard

---

## Common Issues

**"AI coaching is not configured"**: `ANTHROPIC_API_KEY` is missing from Railway env vars.

**"Server error" on login**: Check Railway logs. Usually a DB connection issue.

**Emails not sending**: `RESEND_API_KEY` missing or `RESEND_FROM_EMAIL` not verified on resend.com.

**Schema changes not applying**: The `prisma db push` in the start script handles this. If it fails, check Railway deploy logs.

**onboarding redirect loop**: User has `onboardingDone: false` → app redirects to `/onboarding`. Complete onboarding or manually set `onboardingDone = true` in DB via Prisma Studio.
