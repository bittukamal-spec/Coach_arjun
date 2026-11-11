# Arjun — Review and Build Plan (Nov 2026)

Basis: `CLAUDE.md` (verified against code Oct 2026) plus quick structural checks of the repo. This was a deliberately light review: no line-by-line code read and tests were not run. Items marked **(check)** need confirming.

## 1. Verdict in one paragraph

The engineering is ahead of the evidence. Safety, consent, payments and the coaching loop are built with more care than most prototypes. The risk is not code quality; it is that the app has 11 athlete surfaces, 38 database tables and 37 route files, but no way yet to see whether athletes come back. The next step is to stop adding features, measure, and narrow.

## 2. What is strong

| Area | Why it matters |
|---|---|
| Two-layer safety (fixed-rule screen before any AI, plus prompt rules) | The right design for a product used by minors |
| Guardian consent gate for under-18s | Most competitors skip this |
| Payment upgrade only via signed, de-duplicated webhook | Hard to cheat, hard to double-charge |
| One prescription at a time, follow-up on next open | A real coaching loop, not just a chatbot |
| 84 test files, PR + preview workflow | Changes are reviewable by a non-technical founder |
| Founder dashboard (pulse, safety review, pilot access) | You can run a pilot without a developer |

## 3. Developer view — risks, most serious first

| # | Risk | Plain meaning | Fix size |
|---|---|---|---|
| 1 | No automated checks on PRs (no `.github` folder) | Tests only run if a session remembers to. A broken merge deploys straight to live | Small |
| 2 | No error monitoring | If chat breaks for an athlete at 9pm you find out only if they tell you | Small |
| 3 | `prisma db push` runs on every server start | Database changes apply to live data with no history or undo. Fine today, dangerous with paying users | Medium |
| 4 | Database backups **(check Railway settings)** | One bad change could lose every athlete's history | Small |
| 5 | `Message` table has no index; messages never expire | Chat gets slower as history grows; you hold minors' chats forever | Small + a decision |
| 6 | `chat.js` is 1,766 lines with a ~550-line prompt | Every Coach change is risky and expensive to make | Medium, later |
| 7 | Legacy and dead code (old tables, retired routes, dormant quick chat, unused Hindi strings) | Slows every session and costs tokens | Medium, gradual |
| 8 | Five AI endpoints skip the access check | Free AI use after the pilot | Small, before paid |
| 9 | Account deletion continues if Razorpay cancel fails | Someone could be billed after deleting | Small, before paid |

## 4. Business view

| Topic | Advice |
|---|---|
| Who pays | A 14–17 year old rarely has a card or UPI autopay. The buyer is the parent, or an academy/coach. The app currently speaks only to the athlete. You need a parent-facing reason to pay (e.g. a simple monthly progress note that shares no private chat content) |
| Channel | Selling one athlete at a time at ₹299 is slow. Academies and coaches reach 30–200 athletes each. Test one academy deal during the pilot |
| The one number | Week-4 retention: of athletes who start, how many still open the app in week 4. If below roughly 20–25%, fix the product before spending on growth |
| Unit cost | Measure AI cost per active athlete per month. Target under ₹60 (20% of price). Coach on a larger model can break this |
| Law | India's DPDP Act requires *verifiable* parental consent for under-18s and restricts tracking children. An email link may not count as verifiable. Get one hour with a privacy lawyer before paid launch |
| Positioning | "Not therapy" is correct. Keep it visible at signup and in the parent material |
| Breadth | 11 surfaces is too many to learn from. A pilot answers one question: does talk to Coach, do one practice, come back, repeat actually hold? |

## 5. The plan

Each step is one small PR unless noted. Do them in order.

### Phase 0 — Safety net (about 1 week)
1. Add automated PR checks: server tests, client tests, client build.
2. Add error monitoring on server and client, with message text scrubbed so no chat content leaves your systems.
3. Confirm Railway daily backups are on, and do one test restore.
4. Add the `Message` index.

Done when: a failing test blocks a merge, and a live error reaches your inbox.

### Phase 1 — Measure (about 1 week)
5. Record a few first-party events in your own database, not a third-party tracker, because of minors: signed up, guardian consented, onboarding finished, first Coach message, practice completed, returned on day 2 / 7 / 28.
6. Add a funnel and retention table to the Founder Dashboard.
7. Log AI token cost per athlete and show cost per active athlete.

Done when: you can answer "of 10 athletes who signed up, how many reached each step?" without asking a developer.

### Phase 2 — Narrow the core loop (about 2 weeks)
8. Time the first session. Target: useful advice from Coach within 3 minutes of signup. Cut onboarding questions until that holds.
9. Keep Coach, Quick Rep, Pressure Reset, Ritual and Mind Journal prominent. Move games, Visualization, Skill paths and Focus Deck off the main Train screen, with links kept. Bring any back if athletes ask.
10. Make the follow-up work: one push notification the day after a prescription ("How did the routine go at practice?"). On iPhone, push needs the app added to the home screen, so add a clear install prompt.
11. Draft the parent progress note (email, monthly, no chat content).

Done when: a new athlete gets from signup to a completed first practice in one sitting.

### Phase 3 — Run the pilot (4–6 weeks, mostly not coding)
12. Recruit 20–30 athletes, ideally through 1–2 academies.
13. Each week: read the funnel, review safety events, talk to 3 athletes and 2 parents.
14. Fix only what blocks the core loop. Keep a list of everything else.

Go to paid when all four hold: week-4 retention at or above 25%, at least 5 parents say they would pay, AI cost per active athlete under ₹60, and no unresolved safety incident.

### Phase 4 — Before charging money (about 2 weeks)
15. Add the access check to the five open AI endpoints.
16. Stop account deletion, or alert you, when Razorpay cancel fails.
17. Decide and build message retention (suggest: delete chat older than 12 months; memories stay).
18. Switch from `db push` to tracked migrations.
19. Legal review of consent, privacy policy and refund terms.
20. Parent payment flow: a pay link the athlete can send to a parent.

### Do not build yet
- More tools, games, or gamification
- Hindi UI
- A native Android/iOS app (the installable web app is enough for a pilot)
- A chat history list
- Splitting `chat.js` (do it after the pilot, when you know what Coach must keep)

## 6. How to use this with Claude sessions

Start each session with one step, for example: "Do step 1 of `docs/REVIEW-AND-BUILD-PLAN.md`." One step, one PR, one preview to check. Tick the step off in this file when merged.
