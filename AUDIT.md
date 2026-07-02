# Arjun Codebase Audit — 2026-07-02

Documentation-only audit. No code was changed. Every finding carries `file:line` evidence from the live tree (stale worktrees under `.claude/worktrees/` excluded). Items that cannot be confirmed from code alone are marked **NEEDS VERIFICATION**.

## Summary

**RED: 5 | AMBER: 17 | GREEN: 16 | BACKLOG: 8**

---

## 🔴 RED

1. **Quick chat has zero safety scaffolding** | `server/src/routes/chat.js:122–139` | The quick-chat system prompt contains only name, sport, language, and a `[SUGGEST:]` instruction — no crisis block, no injury block, no helplines. Main chat's full safety sections (`chat.js:416–472`) never apply to quick mode. A distressed teenager in quick chat gets an unguarded model. Blocks MVP for a minors-focused mental-coaching product.

2. **Trial gate covers only one of nine AI endpoints** | `chat.js:582` (only use of `checkFreeLimit`) | An expired-trial free user is blocked from `POST /api/chat/message` but can consume Claude without limit via: `/api/chat/wizard` (chat.js:779 — bounce-back, visualization, cue word), `/api/self-talk/generate` (selfTalk.js:37), `/api/body-reset/arjun-note` (bodyReset.js:15), `/api/debrief` insight (debrief.js:69), `/api/mental-fitness` (mentalFitness.js:25), `/api/weekly-reports` (weeklyReports.js:86), `/api/profile-intro` (profileIntro.js:46), session summaries (sessions.js:34). Unbounded API cost + monetization integrity broken.

3. **Selective deletion "checkin-history" deletes the wrong table** | `server/src/routes/userData.js:59` | Deletes `MentalFitnessEntry` only. `CheckIn` rows (written by `checkin.js:73` and dual-written by `mentalFitness.js:108`, including free-text `reflection`/`gratitude`) survive and keep feeding the coaching prompt (`chat.js:613–618`). The deletion claim in AccountPage does not match what is deleted — a privacy correctness bug.

4. **Broken CSS variables on the daily check-in and Before You Play screens** | `client/src/pages/MentalFitnessCheckin.jsx:173,174,220,221`; `client/src/pages/BeforeYouPlayPage.jsx:531,772,773,823,824` | These reference `--color-dark-600/700/800`, which are **not defined** in `index.css` (only `--dark-*` exist — index.css:11–13). Borders/backgrounds silently resolve to nothing in both themes. Verified directly. Core daily flow renders wrong.

5. **No parental consent and no age at signup for a product targeting 14–25** | No consent field in `schema.prisma`; no consent UI anywhere (only prose: PrivacyPage.jsx:94, TermsPage.jsx:53). Age is optional and collected only post-hoc in `AccountPage.jsx:436–442`; `OnboardingPage.jsx` and `AuthPage.jsx` collect neither age nor DOB. There is no age gate at all. Legal exposure before any marketing to minors in India (DPDP Act requires verifiable parental consent for under-18s).

---

## 🟡 AMBER

1. **KIRAN helpline (1800-599-0019) missing from chat and Self-Talk** | Present only in Body Reset safety screen (`translations.js:1251, 2545`). Chat crisis message has iCall + 112 only (`chat.js:449,452`); SelfTalk safety screen shows iCall only. Inconsistent crisis resources across tools.
2. **Safety events are never logged or persisted** | Crisis/injury detection is prompt-only; `selfTalk.js:81–83` returns `needs_support` to the client but stores nothing. No DB table, no log line, no alert — founder cannot review a single safety incident.
3. **No message-retention job exists** | No cron/scheduler anywhere (`server/package.json` has no scheduler dep; `index.js` registers no jobs). The "7-day" behavior is only a query filter (`chat.js:12,697`; `sessions.js:177–182`) plus opportunistic quick-session cleanup on next quick start (`sessions.js:98–107`). Quick-chat "zero footprint" relies on a best-effort client `DELETE` on tab-hide (`ChatPage.jsx:401–410`) — if the browser is killed, quick messages persist server-side indefinitely. Privacy policy makes no 7-day promise (PrivacyPage.jsx:88–90), so this is an internal-expectation gap, not a policy breach.
4. **Razorpay webhook is not idempotent** | `payments.js:15–81` | No event-ID dedup. Effects are overwrite-style (low harm), but a replayed `subscription.charged` resets `subscriptionStartDate` each time (payments.js:50–53).
5. **Account deletion proceeds even if Razorpay cancel fails** | `auth.js:252–254` | Failure is logged and swallowed — can leave a live paid subscription with no user record. Needs a reconciliation path.
6. **OCEAN personality is fully dead — including a latent bug** | Fields never written by any route (only nulled, `userData.js:34–38`); no test UI exists anywhere. The one reader, the bounce_back wizard (`chat.js:810–811`), reads `user.oceanN/oceanO` from a query that selects only `sport, ritualSteps, language` (`chat.js:782–786`) — so the values are always `undefined` and silently fall back to 3. OCEAN personalization has never functioned.
7. **Missing DB indexes on hot tables** | `Message` has no index at all (schema.prisma:116–126) yet is queried by userId/chatSessionId/createdAt constantly; `CheckIn`, `Debrief`, `DrillCompletion`, `GameSession` also unindexed. Will degrade with growth.
8. **CORS allows all origins** | `server/src/index.js:27` `cors({ origin: true })` | `CLIENT_URL` is not used for an allow-list, contradicting CLAUDE.md §5.
9. **`[SUGGEST:]` chips: generated every reply, parsed, then discarded** | Prompt mandates them on every message (`chat.js:346`, quick `chat.js:138`); client strips them (`ChatPage.jsx:20–26`) and throws the suggestions away (`ChatPage.jsx:432,540`). Wasted tokens on every single reply + a dead feature.
10. **Weekly reports are lazy, not Monday-scheduled** | `weeklyReports.js:90` generates last week's report on first Progress-page load (≥3 messages). Works, but there is no push cadence, and generation adds 1–2s latency to the first Progress load each week.
11. **Daily drill is server-built but orphaned from the UI** | `drills.js:59` (`/today`), `drills.js:98` (`/complete`, +15 XP) fully implemented and registered (`index.js:35`) — zero client callers. Dashboard drill card was removed; TrainPage has none.
12. **Legacy `/api/checkin` route has no client caller** | The live check-in is `MentalFitnessCheckin.jsx` → `/api/mental-fitness`. `checkin.js` survives only via a dual-write (`mentalFitness.js:108`); its `gratitude`/`reflection` collection UI is gone while translations for it linger (`translations.js:365`).
13. **SelfTalk cards are not directly used in coaching context** | Never queried in `chat.js`; they surface only as a one-line ToolReport summary (`selfTalk.js:149–165` → `chat.js:315–322`). The "Focus Word in Arjun's context" promise is thinner than it looks.
14. **MFS "Show all" toggle does not exist** | No `showAll`/equivalent state anywhere in `MentalFitnessCheckin.jsx` or `ProgressPage.jsx`. If this was a spec item, it was never built.
15. **Design drift vs Calm Clarity** | Two competing brand blues: tailwind `brand.500 = #1769AA` (tailwind.config.js:27) while screens hardcode `#185FA5` (MentalFitnessCheckin ×14, BreathingPage, ChatPage:153, SelfTalk, FocusDeck, Pricing, BYP). Purple `#8B5CF6` still in config (tailwind.config.js:60, index.css:46) and used on Dashboard:347–348, TrainPage:86–87,116–117, SelfTalkPage:156,401,484, LandingPage:9. `VisualizationPage.jsx:11–19` uses a hardcoded light palette that ignores the theme system (its dark step-4 is intentional); `BounceBackPage.jsx:31–41` is hardcoded always-dark (intentional per design decision, but token-blind). Theme default is light with `[data-theme]` override; font is **Poppins** (index.css:132), not Inter — confirm which is intended.
16. **Small-text readability risk on mid-range Android** | 68 instances of `text-[9px]/[10px]/[11px]` across 19 files; heaviest: BodyResetPage (7), ResetHistoryPage (7), GamesPage (7), Dashboard (6).
17. **Stale/contradictory docs** | `PROJECT.md` describes the SQLite/"MindGame"/5-chats-per-week era; `PLAN.md` is an obsolete chat-UX plan; CLAUDE.md claims CORS uses CLIENT_URL (it doesn't — index.js:27) and lists a personality test as built (no UI exists).

---

## 🟢 GREEN

- **Full account deletion** — correct order: read user → Razorpay cancel (`cancel_at_cycle_end:false`) → Messages → ChatSessions → `user.delete()` cascade → audit log → email (`auth.js:231–280`). No orphans: all 14 user relations have `onDelete: Cascade`.
- **Webhook signature verification** — HMAC-SHA256 over raw body, correctly wired before `express.json()` (`index.js:23`, `payments.js:17–26`).
- **Tier upgraded ONLY in webhook** (`payments.js:38`); no client-callable upgrade path; `RAZORPAY_KEY_SECRET` never sent to frontend or logged.
- **Razorpay checkout is real end-to-end** — PricingPage → `create-subscription` → checkout.js script → webhook (`PricingPage.jsx:12–76`, `payments.js:85–119`).
- **SAFE_SELECT excludes password** (`auth.js:14–23`); login re-selects safely.
- **Navigation is clean** — all 30 routes resolve; every page imported; all tool back-buttons land on `/train`; no `navigate()` targets a missing route. **SessionsPage and PressureResetPage confirmed gone** — no files, no imports, no routes.
- **Main-chat safety blocks are comprehensive** — crisis (`chat.js:440–464`) + injury (`chat.js:416–438`), EN + Hinglish, iCall 9152987821 + 112, "safety overrides everything" (`chat.js:466–472`).
- **14-day trial gate works on main chat** (`chat.js:47–71`, 429 `TRIAL_ENDED`).
- **buildSystemPrompt is rich and layered** — MFS entries + trend, ToolReports, profile, CheckIns, memories, debriefs, drills, game scores, ritual, mood volatility, action bridge (`chat.js:118–479`).
- **ToolReports generated by 6 tools** (debrief.js:225, selfTalk.js:149, chat.js:957 visualization, chat.js:996 bounce-back, cue.js:37, bodyReset.js:97) and consumed in the prompt (`chat.js:678`).
- **Self-Talk integrity** — 5-card limit server-side (`selfTalk.js:106–110`), all card fields persisted, single match-day card enforced (`selfTalk.js:218–223`).
- **MFS check-in solid** — 7 questions, word-label Likert (no numbers), streak from `/api/progress/summary`, freeze mechanic.
- **`[APP:]` tool cards work** — parsed (`parseArjunMessage.js:52–61`), rendered (`ChatPage.jsx:193–245`), 6 tools mapped, max 2 per reply.
- **7-day chat window on load** — `?since` param implemented both ends (`ChatPage.jsx:422–424`, `sessions.js:177–182`).
- **Theme system** — light default, `[data-theme]` manual override, OS auto-detect, localStorage persistence (`useTheme.js`, `index.css:8–120`).
- **XP/achievements pipeline** — central `awardXP` used by check-in, MFS, games, drills; GameSession records created (`games.js:17–22`); 9 badges defined server-side (`gamification.js:7–17`).

---

## 📋 BACKLOG

1. WhatsApp reminders — env stubs only (`.env.example:38–50`); zero code; `phone`/`reminderOptIn` schema fields unused.
2. Sentry — not in any package.json, no init code.
3. PostHog — not in any package.json, no init code (client or server).
4. Personality test UI — schema fields ready; build the test or drop the fields.
5. Data export endpoint (right of access) — deletion exists, export does not.
6. Webhook event-ID dedup table (fixes AMBER 4 properly).
7. Avatar upload is localStorage-only (`AuthContext.jsx:91–97`) — move to server storage; `User.avatar` column exists but is never written.
8. Decide daily-drill fate: build a client entry point or delete `drills.js` + `DrillCompletion`.

---

## Compliance Gaps

1. **No parental-consent mechanism** — no schema field, no UI flow; only prose (PrivacyPage.jsx:94, TermsPage.jsx:53). Product targets 14–25 including minors. (= RED 5)
2. **No age/DOB at signup** — age optional and only editable later in AccountPage; no age gate anywhere. (= RED 5)
3. **No data export** — erasure exists (and Privacy §5 promises it, correctly); access/portability does not.
4. **No analytics at all** — PostHog absent; PrivacyPage.jsx:47 states "no third-party analytics," which is currently accurate. If PostHog is added later, the policy and under-18 handling must be updated together.
5. **Safety events invisible to the founder** — no persistence or alerting of crisis/injury triggers anywhere. (= AMBER 2)
6. **Deletion claim mismatch** — "checkin-history" leaves `CheckIn` rows (incl. free-text reflections) intact. (= RED 3)
7. **Child privacy notice: present** — PrivacyPage.jsx:93–94 (§8 Minors) covers 13+, under-18 parental awareness, no under-13 collection. ✓
8. **Retention policy vs code: consistent** — policy promises retention while active + deletion on account delete; code delivers (cascade delete is immediate, better than the stated 24h). ✓

---

## Dead Code

| Item | Location | Note |
|---|---|---|
| `passport.js` | `server/src/config/passport.js` | Never required; `passport` deps not even installed — would crash if imported. Delete. |
| `drills.js` (client data) | `client/src/data/drills.js` | Never imported; GamesPage uses its own inline data. |
| `pressureReset` namespace | `translations.js:287` (en) + hi twin | Zero references — leftover from removed PressureResetPage. |
| `wizard` namespace | `translations.js:296` (en) + hi twin | Zero references. |
| `games` namespace | `translations.js:1006` (en) + hi twin | GamesPage doesn't import translations at all. |
| `checkChatAchievements` | `server/src/services/gamification.js:119` | Exported, never called by any route. |
| Unused schema fields | `schema.prisma`: `razorpayCustomerId` (:52), `reminderOptIn` (:48), `phone` (:47), `googleId` (:16), `subscriptionEndDate` (:55, write-only), `oceanO–N` (:63–67, never written) | Additive-only rule means keep, but document as inert. |
| `POST /api/checkin` | `server/src/routes/checkin.js` | No client caller; model kept alive only by mentalFitness dual-write. |
| `SESSION_INSTRUCTIONS` (8 types) | `chat.js:75–114` | Client always sends `sessionType='general'` (ChatPage.jsx:443–447) — the 8 topic instructions are unreachable from the UI. |
| Discarded `[SUGGEST:]` output | `ChatPage.jsx:20–26, 432, 540` | Parsed, never rendered. |
| Stale worktrees | `.claude/worktrees/agent-a2c…`, `agent-a95…` | Full outdated app copies (contain the removed SessionsPage/PressureResetPage). Repo hygiene — remove. |
| Stale docs | `PROJECT.md`, `PLAN.md` | Describe previous eras of the product; misleading for any collaborator. |

---

*Audit complete. 5 RED | 17 AMBER | 16 GREEN | 8 BACKLOG.*
