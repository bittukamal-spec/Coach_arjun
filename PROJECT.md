# MindGame — AI Mental Coaching App for Indian Athletes

## What is this?

An AI-powered mental performance coaching app built for athletes in India.
Bilingual (English + Hindi), freemium model, powered by Claude AI.

**Live demo:** localhost:5173 (local only for now)
**GitHub branch:** `claude/mindgame-setup-auth-m3cxg6`

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite | UI / pages |
| Styling | Tailwind CSS | Design system |
| Backend | Node.js + Express | API server |
| Database | SQLite + Prisma | Stores users, messages, check-ins |
| AI | Anthropic Claude (Haiku) | Coaching responses |
| Auth | JWT + bcrypt | Login / sessions |
| Charts | Recharts | Progress graphs |

---

## How to Run Locally

### Every time you want to use the app, open 2 Command Prompt windows:

**Window 1 — Backend server**
```
cd mindgame\server
node src/index.js
```
Must show: `MindGame server running → http://localhost:5000`

**Window 2 — Frontend**
```
cd mindgame\client
npm run dev
```
Must show: `Local: http://localhost:5173/`

Then open **http://localhost:5173** in browser.

### First time only (setup)
```
cd mindgame\server
npm install
npx prisma migrate deploy
```
```
cd mindgame\client
npm install
```

### If you restart your PC
Both servers stop. You need to run them again (Window 1 + Window 2 above).

---

## Environment Variables (server/.env)

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=sk-ant-...your key...
JWT_SECRET=any-long-random-string
CLIENT_URL=http://localhost:5173
PORT=5000
```

**Never share or commit your .env file.**
Get Anthropic API key from: console.anthropic.com

---

## Features Built ✅

- [x] Email + password sign up / sign in
- [x] Onboarding wizard (sport, experience level, goals, language)
- [x] AI coaching chat (streams responses in real time)
- [x] Bilingual — English and Hindi
- [x] Daily check-ins (mood / focus / confidence 1–5)
- [x] Progress page with charts (7 day / 30 day)
- [x] Streak tracker
- [x] Free tier limits (5 chats/week, 3 check-ins/week)
- [x] Premium tier system (user.tier = 'premium' bypasses limits)
- [x] Dashboard with badges (sport, level, streak)

---

## Features To Build 🔜

### Phase 1 — Make it real (Priority)
- [ ] **Razorpay payment** — ₹299/month subscription, upgrades user to premium
- [ ] **Deploy online** — so anyone can use it, not just localhost
- [ ] **PostgreSQL** — replace SQLite for production (Railway/Supabase free tier)
- [ ] **Custom domain** — mindgame.in or similar (~₹800/year)

### Phase 2 — Differentiators (What makes us better than ChatGPT)
- [ ] **Weekly insight card** — AI auto-spots patterns in check-in data ("Your confidence drops on match days")
- [ ] **Pre-match routine** — 5-min guided mental warmup (breathing + visualization) before a match
- [ ] **Post-loss protocol** — structured conversation to process defeat and reset mentally
- [ ] **Slump recovery plan** — 7-day mental training plan when scores drop for 5+ days
- [ ] **Shareable PDF report** — 30-day mental performance summary athlete can show their coach/parents
- [ ] **India-specific pressure onboarding** — family pressure, board exams, financial stress, coach culture
- [ ] **Crisis detection** — flag when check-in scores crash for 5+ days, suggest professional help
- [ ] **Coach personas** — Tactical / Motivator / Calm Guide styles the user can pick
- [ ] **Community feed** — anonymous posts from athletes, premium users can post
- [ ] **Sport-specific protocols** — kabaddi, kho-kho, shooting, wrestling (not just cricket)

### Phase 3 — Growth
- [ ] **Coach memory** — summarize old sessions, give Claude more context
- [ ] **Email/WhatsApp reminders** — daily check-in nudge
- [ ] **Admin dashboard** — see users, revenue, usage stats
- [ ] **Parent/coach portal** — optional visibility for youth athletes

### Phase 4 — Mobile App
- [ ] Convert frontend to React Native
- [ ] Google Play Store (Android)
- [ ] Apple App Store (iOS — needs Mac + $99/year developer account)

---

## Database Models

```
User
  id, email, name, password (bcrypt), avatar
  tier (free/premium), language (en/hi)
  sport, experienceLevel, goals (JSON), onboardingDone
  createdAt, updatedAt

CheckIn
  id, userId, mood (1-5), focus (1-5), confidence (1-5)
  reflection (optional text), createdAt

Message
  id, userId, role (user/assistant), content, createdAt
```

---

## API Routes

| Method | Route | What it does |
|---|---|---|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Sign in |
| GET | /api/auth/me | Get logged-in user |
| PATCH | /api/auth/me/onboarding | Save onboarding answers |
| POST | /api/chat/message | Send message to AI coach (streaming) |
| GET | /api/chat/messages | Load chat history |
| GET | /api/chat/usage | Weekly message count |
| POST | /api/checkin | Save daily check-in |
| GET | /api/checkin/today | Check if already checked in today |
| GET | /api/progress/summary | Get charts + stats data |

---

## Folder Structure

```
mindgame/
├── client/                  ← React frontend
│   └── src/
│       ├── pages/           ← LandingPage, Dashboard, ChatPage, etc.
│       ├── components/      ← Navbar, ProtectedRoute
│       ├── contexts/        ← AuthContext (user session)
│       └── i18n/            ← translations.js (EN + HI strings)
│
├── server/                  ← Node.js backend
│   ├── src/
│   │   ├── routes/          ← auth.js, chat.js, checkin.js, progress.js
│   │   ├── middleware/      ← authenticate.js (JWT check)
│   │   └── index.js         ← app entry point
│   ├── prisma/
│   │   ├── schema.prisma    ← database schema
│   │   └── migrations/      ← database change history
│   └── .env                 ← YOUR SECRETS (never commit this)
│
└── PROJECT.md               ← this file
```

---

## To Deploy Online (When Ready)

1. Create account on **Railway.app** (free tier available)
2. Add a PostgreSQL database on Railway
3. Update DATABASE_URL in server env vars
4. Push server code to Railway
5. Push client code to Vercel (free)
6. Point a domain to both
7. Set ANTHROPIC_API_KEY in Railway environment variables

---

## Costs When Live

| Service | Cost |
|---|---|
| Railway (server + DB) | ~₹800–1,500/month |
| Vercel (frontend) | Free |
| Domain (.in) | ~₹800/year (~₹70/month) |
| Anthropic API (Haiku) | ~₹0.10 per conversation — 500 users ≈ ₹2,000/month |
| Razorpay | 2% per transaction, no monthly fee |
| **Total (500 users)** | **~₹5,000/month costs vs ₹1,49,500 revenue** |

### Break-even point
- Fixed costs: ~₹2,500/month
- Need only **9 premium subscribers at ₹299/month** to cover costs
- At 100 premium users → ₹29,900 revenue, ~₹4,000 costs → **₹25,900 profit/month**

---

## Key Decisions Made

- **No Google OAuth** — removed to simplify setup. Email/password only.
- **SQLite for now** — easy local dev, switch to PostgreSQL before going live.
- **Claude Haiku** — cheapest Claude model, fast, good enough for coaching.
- **Streaming SSE** — responses appear word by word like ChatGPT.
- **Bilingual via translations.js** — all UI text in one file, easy to edit.

---

## Quick Fixes / Known Issues

- **Message limit hit during testing?** Run in server folder:
  ```
  node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.message.deleteMany({}).then(r=>{console.log('Cleared',r.count);p.$disconnect()})"
  ```
- **Server crashed?** Just run `node src/index.js` again in the server folder.
- **Frontend stopped?** Just run `npm run dev` again in the client folder.
- **Both must run at the same time** for the app to work.
