# Arjun — Full Product & MVP Audit
**Date:** 2026-07-04 · **Code state:** branch `claude/mindgame-setup-auth-m3cxg6`, HEAD `2abcc79` · Verified against live code, not stale docs.

> Context: the 2026-07-02 AUDIT.md found 5 RED / 17 AMBER issues. Since then, commit `bb4e4d0` fixed RED 1–4 (quick-chat safety, trial gates, selective deletion, CSS vars) and this branch added Mental Reps games, the founder dashboard, and the main-chat resume fix. This audit reflects the code **as it is now**.

---

## A. Executive Summary

Arjun is **further along than a typical MVP** — the engineering fundamentals (auth, payments, deletion, chat safety, tool persistence) are mostly solid, and the coach voice is genuinely good. The problem is not missing features. It is the opposite: **the app has ~9 tools, 2 games, chat, MFS, weekly reports, XP/streaks/achievements, 2 themes, and 2 languages — with duplicated engines, duplicated entry points, and no clear hierarchy.** A 15-year-old opening the app sees three doors to the same tool and no single obvious "do this now."

**The four things standing between you and launch:**

1. **No age gate or parental consent at signup** (RED 5, still open). You are marketing a mental-coaching product to minors in India with zero DPDP compliance at registration. This is the only true launch blocker.
2. **Safety events are invisible.** Crisis/injury detection works in chat (both modes now), but nothing is ever logged. You cannot answer "has a distressed teenager used my app this week?" Also: the founder dashboard's safety counter is **permanently 0 due to a bug** (`founder.js:59` queries a String column with a boolean).
3. **Helplines are inconsistent** — three different sets across surfaces. KIRAN is missing from Self-Talk and Bounce Back.
4. **No rate limiting anywhere** and CORS is open to all origins — trivially abusable AI endpoints on your Anthropic bill.

**The product-shape verdict:** don't add anything. Cut duplication (3 breathing engines, 2 visualization flows, cue-word ownership split across 3 tools, tools listed in 2–3 places), make MFS → recommended tool → chat follow-up the explicit spine, and polish the 6-tool core.

---

## B. Current App Inventory

**Routes (30):** landing, auth, forgot/reset password, privacy/terms/refund, onboarding, mental-game-profile, dashboard, coaching, mental-fitness (+/checkin alias), progress, account, train, breathing, body-reset (+history), bounce-back, before-you-play, ritual, debrief, visualization, self-talk, focus-deck, games (+focus-lock, +reset-rally), pricing, payment-success.

**Navigation:** 6-tab BottomNav (Home/Train/Games/Coach/Progress/Profile), mobile-only (`sm:hidden`). Hidden on `/coaching`. **Desktop has no primary nav at all** — Navbar dropdown only reaches /account.

**DB models (16):** User, CheckIn, Message, ChatSession, UserMemory, UserAchievement, DrillCompletion, Debrief, GameSession, PasswordResetToken, MentalFitnessEntry, ToolReport, WeeklyReport, SelfTalkCard, BodyResetSession (+ inert fields: googleId, phone, reminderOptIn, oceanO–N, razorpayCustomerId, subscriptionEndDate).

**API surface:** ~45 endpoints across 19 route files. AI endpoints: chat/message (SSE), chat/wizard, self-talk/generate, body-reset/arjun-note, debrief, mental-fitness, weekly-reports, profile-intro, session summaries, memory extraction.

**State of core systems:**
| System | State |
|---|---|
| Auth (JWT+bcrypt) | ✅ Working. No rate limit on login/register. No age field at signup. |
| Trial gating | ✅ Fixed. Hard 429 on chat/wizard/self-talk-generate/body-reset-note; soft fail-open gate on debrief/profile-intro/weekly-reports/MFS/summaries. Games/checkin/cue ungated (no AI — fine). |
| Chat | ✅ Working. Single persistent main session (resume bug fixed at `2abcc79`), quick mode, SSE streaming, full safety blocks in **both** modes, memory extraction, rich context prompt. |
| Tool saves | ✅ 6 tools write ToolReports consumed by the coaching prompt. Self-Talk cards + Body Reset sessions have full CRUD. |
| Payments | ✅ Checkout + webhook working. ⚠️ No idempotency; deletion swallows Razorpay-cancel failures. |
| Deletion | ✅ Full account deletion correct; selective deletion fixed. ⚠️ Multi-step deletes not in `$transaction`. |
| Weekly reports | ✅ Lazy generation on Progress load (adds 1–2s first load each week). No cron. |
| Founder dashboard | ✅ Live. ⚠️ `flaggedCards` metric always 0 (String-vs-boolean bug). |

**Complete / partial / broken:**
- **Complete:** MFS, chat, Bounce Back, Debrief, Breathing, Self-Talk + Focus Deck, Games, Progress, payments, deletion.
- **Partial:** Body Reset (pause bug), Before You Play (client-side XP), Visualization (dead vars, theme seams), desktop experience, i18n coverage (Games page English-only; heavy hardcoded strings on Landing/Dashboard/Account).
- **Broken/dead:** founder safety metric, WhatsApp "Coming soon" row (looks tappable, does nothing), OCEAN reader (reads fields never selected), `[SUGGEST:]` chips (generated every reply, parsed, thrown away), 8 SESSION_INSTRUCTIONS variants (unreachable), daily drill backend (no client), `/api/checkin` (no client), ToolCard lock/PRO props (never passed).

---

## C. Biggest MVP Problems (ranked)

1. **Minors compliance gap.** No age, no DOB, no guardian consent at signup; `age` optional, editable later, validated 8–80. The system prompt literally assumes a 14–17-year-old. Launch marketing to minors without this = DPDP exposure.
2. **Safety is a black box.** Detection exists but leaves zero trace. No SafetyEvent table, no log line, no alert. The one persisted signal (Self-Talk `safetyFlag`) is counted wrong on the founder dashboard.
3. **No abuse protection.** Zero rate limiting (auth brute-force, AI cost attack), CORS `origin: true`, webhook not idempotent.
4. **Duplication instead of hierarchy.** Three breathing engines (Breathing, Body Reset screen 7, Bounce Back step 4). Two visualization flows (Visualization page, BYP step 4). Cue/focus word split across Before You Play, Self-Talk, Ritual, and Focus Deck. Every tool reachable from 2–3 places (Dashboard Quick Tools, Train sections, BottomNav). The athlete never learns "one place per moment."
5. **First-run does nothing with what onboarding learned.** Onboarding collects challenge + goals → Mental Game Profile screen → dumps user at generic /coaching or /dashboard. The MFS check-in — your best diagnostic and habit anchor — is not the mandated first action, and the tool recommendation is buried inside the MFS report bottom-sheet.
6. **i18n is three systems at war.** `translations.js` (complete, both languages) + inline `hi ? '…' : '…'` ternaries + pure hardcoded English. The entire PWA install flow, Dashboard section labels, Account option labels, and the whole Games section are English-only. Two no-op ternaries render identical strings in both branches (`AccountPage.jsx:601,618`).
7. **Design accent sprawl.** Two brand blues (`brand.500 #1769AA` in config vs `#185FA5` hardcoded ~30×), teal (Body Reset), purple (Self-Talk, Dashboard, Train), three ambers, plus Bounce Back's own palette object. No single accent system.

---

## D. What Is Already Strong

- **Arjun's voice.** The system prompt is genuinely well-crafted: "trusted older brother," banned therapy-filler phrases, 2–3 sentence cap, one question per reply, Indian-context awareness (family pressure, academics, selection), Hinglish rules, verbatim safety scripts in EN + Hinglish. This is the moat — protect it.
- **Safety in chat is now real, in both modes** — injury + crisis blocks with iCall + KIRAN + 112, "safety overrides everything."
- **The data spine exists.** ToolReports → coaching prompt is exactly the right architecture: every tool completion becomes coaching context. MFS dimensions + trends + today's report are injected. Memory extraction runs every 5th message.
- **Payments are done right where it counts:** HMAC before body-parse, tier upgrade only in webhook, secret never client-side.
- **Deletion is done right:** correct order, full cascade, audit log, confirmation email.
- **Tool copy is on-voice.** "Your body talks first. Breathing answers." / "One bad moment is not your level." / "That stillness is your match state. Carry it in." No therapy drift, no childishness in the tools themselves.
- **Hindi coverage in translations.js is complete** across all 29 namespaces, with natural loanwords (फोकस, परफॉर्मेंस) — the gaps are in the JSX that bypasses it, not the file.
- **MFS check-in UX** — 7 taps, ~90 seconds, word-labels not numbers, streak + freeze, one-per-day enforced server-side, recommends a tool from the lowest dimension.

---

## E. Feature-by-Feature Audit

| Feature | Current status | Athlete value | MVP priority | Problems | Recommended changes | Verdict |
|---|---|---|---|---|---|---|
| **MFS Check-in** | Complete | **High** — daily anchor, diagnostic, feeds chat | **Core** | Lands on /dashboard while every other tool lands on /train; hardcoded `#185FA5`/`#E2711D` inline dozens of times; **zero safety surfacing even at rock-bottom scores**; recommendation buried in bottom-sheet | Add a one-line support message + helpline when avg ≤2 or selftalk=1; surface the recommended tool as the primary result-screen CTA, not inside a sheet | **Keep — make it the spine** |
| **Chat with Arjun** | Complete (resume fixed `2abcc79`) | **High** — the product | **Core** | `[SUGGEST:]` chips generated every reply then discarded (tokens burned, and 14-year-olds don't know what to type — chips would help them); 8 session-type variants are dead code; no BottomNav on /coaching (dead-end); quick-chat "not saved" depends on best-effort client DELETE | Render the suggestion chips (they're already parsed — this is the cheapest UX win in the app); delete dead SESSION_INSTRUCTIONS or wire `post_checkin`; add a back affordance on /coaching | **Keep** |
| **Breathing (Calm Body)** | Complete | **High** — fastest value, pre-match + anytime | **Core** | Third of three breathing engines; legacy `showInfo` flag duplicates the intro state machine; hardcoded accent hex | Make this THE breathing engine; remove the double intro | **Keep — canonical calm tool** |
| **Body Reset** | Complete, buggy | Medium-High | Secondary | **11 screens labeled "/7"** — longest flow in app; `togglePause` resets cycle/elapsed to 0 (pause = restart); teal accent unique to this tool; overlaps Breathing heavily | Fix pause bug now; cut to ≤7 screens (merge feeling+context, drop the mode picker); medium-term decide whether it merges into Breathing as a "with check-in" variant | **Simplify** |
| **Bounce Back** | Complete | **High** — the post-mistake hero moment | **Core** | Fully hardcoded palette ignores theme (intentional dark is fine; token-blindness isn't); intensity-5 safety screen has **no KIRAN**; 4th duplicated breathing step | Add KIRAN to the safety screen; leave the intentional dark; longer-term point step 4 at the shared breathing component | **Keep** |
| **Before You Play** | Complete | **High** — pre-match moment | **Core** | Most complex tool: 3 bespoke pointer/RAF game engines; **XP set client-side** (`setXpEarned(15)`, not server-authoritative); cue-word creation overlaps Self-Talk focus word; RotateCcw icon on Dashboard vs Target on Train | Move XP server-side; make step-2 mini-game skippable; unify iconography | **Keep — simplify step 2** |
| **After the Match (Debrief)** | Complete | **High** — reflection habit, one/day | **Core** | Abuse-word nudge on free text but **no helpline** — the tool collecting the most free text has the weakest safety; 409 already-done handled well | Add helpline line to the abuse-word nudge; nothing else — this is the best-built tool | **Keep** |
| **Visualization** | Complete | Medium | Secondary | Overlaps BYP step 4; hardcoded light borders (`#E2E8F0`) create visible seams in dark theme; builds context strings that are never sent (dead vars); step-4 always-dark is intentional | Fix the light-border seams; delete dead vars; keep standalone (it serves training days; BYP serves match day) | **Keep — small fixes** |
| **Self-Talk Builder** | Complete | Medium-High — generates the focus words other tools consume | **Core** | 7 screens + practice (long but justified); purple accent (third accent system); safety screen **iCall only**; `setField` double-call and `\|\|` side-effect hack | Add KIRAN + 112 to safety screen; swap purple to brand accent | **Keep** |
| **Focus Deck** | Complete | Medium — retrieval surface for cards | Secondary | Duplicated delete-confirm block; fine otherwise | Nothing urgent | **Keep** |
| **Games (Mental Reps)** | Complete, new | Medium — engagement/habit for 14–17 | Secondary | **English-only — the single i18n gap in the tool set**; total limit (5) returned but not enforced; overlaps Focus/Bounce intents of the tools (acceptable — reps vs. sessions) | Add `games` namespace strings in EN+HI; enforce or drop `totalLimit` | **Keep small — no more games** |
| **Ritual (My Routine)** | Complete | Low-Medium | Marginal | Cue word is *set* in Before You Play but *displayed* via /ritual from Dashboard's Match Day card — split ownership confuses the mental model | Fold routine display into Before You Play's done/entry screen, or make Dashboard's Match Day card open BYP | **Delay decision — candidate to merge** |
| **Weekly Reports** | Complete (lazy) | Medium | Secondary | 1–2s latency on first Progress load each week; no push | Keep lazy for MVP; cron later | **Keep** |
| **Progress** | Complete | Medium-High | **Core** | 7 metrics shown, only 3 plotted, unexplained; biggest hardcoded-hex file; error string hardcoded EN | Label the chart ("Top 3 trends") or plot all; tokenize later | **Keep** |
| **XP / Streaks / Achievements** | Complete | Medium (motivation layer) | Secondary | Inline `xp: increment` in debrief/chat/cue bypasses `awardXP`; emoji/XP layer skews young for the 18–25 half | Consolidate through awardXP when touched; don't expand | **Keep — don't grow** |
| **Mental Game Profile intro** | Complete | Low-Medium | Marginal | No error state (silent empty box on API failure); stale on re-entry from Account | Add error fallback text | **Keep — tiny fix** |
| **Daily Drills (backend)** | Orphaned | None (unreachable) | — | Full server implementation, zero client callers | Delete route + model usage, or build one entry point — decide | **Remove (or consciously delay)** |
| **WhatsApp reminders row** | Dead placeholder | Negative (looks broken) | — | `opacity-60`, ChevronRight, no onClick | Remove the row until the feature exists | **Remove now** |

---

## F. Design / UI Audit

**Three consistency tiers found:**
1. **Token-aligned (best):** Debrief, Focus Deck, Reset History, Games hub — these are what the whole app should look like.
2. **Token base + hardcoded accents:** Breathing, Body Reset (teal), Before You Play (3 arousal hexes), Self-Talk (purple), MFS (`#185FA5`/`#E2711D` inline everywhere), Progress (7 metric hexes + chart hexes).
3. **Theme-blind:** Bounce Back (own `C` palette object, own font scale — intentionally dark, but token-blind) and Visualization (light-mode border hexes on a dark app = visible seams).

**Specific issues:**
- **Two brand blues:** `tailwind brand.500 = #1769AA` vs `#185FA5` hardcoded ~30 times. Pick `#185FA5`, update the token, delete the hexes over time.
- **Accent sprawl:** blue + teal + purple + 3 ambers + Bounce Back's own set. Recommendation: **one brand blue + one amber**, tool-specific accents only where emotionally intentional (Bounce Back dark = keep).
- **Icon semantics inconsistent:** Before You Play is `RotateCcw` on Dashboard but `Target` on Train; pick one icon per tool everywhere.
- **`ProtectedRoute` renders `null` while loading** — blank flash on every protected route. One-line spinner fix.
- **68 instances of 9–11px text** across 19 files — readability risk on mid-range Android, your core device.
- **Desktop:** BottomNav is `sm:hidden` and nothing replaces it. Either add a simple top-nav row ≥sm, or explicitly position as mobile-only PWA (and make the desktop landing say so).
- **Empty/loading/error states:** Progress is the gold standard (has all three). Dashboard, Mental Game Profile, Account achievements all swallow errors silently — network failure is indistinguishable from "no data."

**Redesign priority order:** 1) MFS check-in result screen (surface the recommendation), 2) Dashboard hierarchy (below), 3) Visualization theme seams, 4) tokenize MFS/Progress hexes. **Do not redesign** Bounce Back's dark mood or the tool flows that work.

**Reusable components to extract when touched:** bottom-sheet (Dashboard repeats it 3×), breathing engine (3 copies), delete-confirm block (Focus Deck 2×), tool card (Train has 2 bespoke variants).

---

## G. Content / Tone Audit

**Verdict: the voice is right.** Calm, direct, sport-framed, "older brother," no therapy drift, no childishness in the tools. The failure mode is **motivational-poster clichés**, concentrated in the streak/check-in namespaces:

Weak (fix in one copy pass):
- "Showing up every day is how champions are built." / "Champions show up every single day." / "30 days. You train your mind like a champion." / "Every champion started on day one." — four "champion" clichés in two namespaces.
- `progress.fitnessLabel` tier ladder ("Elite / Sharp / In Form…") feels app-y, not coach-y.
- `chat.emptySubtitle` is a run-on for a 14-year-old reader.

Good (this is the register — write everything like this):
- "I'm here. Tell me what happened."
- "'Don't mess up' creates pressure. 'Next action' gives focus."
- "That one hurt because you care. One bad moment is not your level."
- "Be honest. No one else sees this."

**Hindi:**
- Coverage complete in translations.js; quality generally natural with the right loanwords.
- **Register inconsistency: आप vs तुम mixed within the same namespace.** Pick तुम (fits the coach persona) and hold it everywhere — one focused pass.
- Literal calques: "वापस स्वागत है" (welcome back), "आज आप कैसे उतर रहे हैं?" (showing up) — rewrite naturally.
- The real Hindi problem is the JSX that bypasses translations entirely: Landing install flow, Dashboard section labels, Account option-label maps, Games section — Hindi users hit walls of English at the most important surfaces (install! signup!).

**Copy patterns to adopt:** ≤12 words per line on tool screens; name the moment, not the emotion ("Before your match" not "Feeling anxious?"); one concrete action per screen; drop "champion"; never exclaim.

---

## H. Target-User Fit (14–17 Indian athletes)

**Works:**
- Pressure scenarios are authentically Indian: selection trials, coach criticism, parents watching, family expectations — in onboarding challenges, chat session prompts, Reset Rally scenarios, and the system prompt itself.
- Multi-sport from day one (11 sports incl. kabaddi).
- Moments-based tool framing (before match / after mistake / after match) matches how a teenager actually experiences sport.
- Reading level is deliberately 14–17 (`chat.js:440`) and mostly holds.
- Feels like coaching, not therapy — the banned-phrase list actively enforces this.

**Doesn't:**
- **The app assumes the athlete will explore.** A 15-year-old won't. They need one big button per moment. The current Dashboard has ~7 competing cards.
- Emoji/XP density (🌿🏹😄, "Logged! ✓", MXP) skews 12–14; fine for the core but slightly cheap for the 18–25 half. Don't expand the gamification layer.
- English-only install flow + signup headings — for Hindi-preferring parents (who may be the ones installing/approving), the first impression is untranslated.
- Numeric "score /100" framing is very quantified-self; the word-label Likert inside MFS is better-judged than the ring number outside it. Consider leading with the word label ("In Form") and demoting the number.
- No parent-facing anything: no consent, no explainer page ("What Arjun is / isn't"). For minors, parents are the buyer. One static page would go far.

---

## I. Safety / Minor-User Audit

**Current coverage map (verified in code):**

| Surface | Detection | Helplines | Status |
|---|---|---|---|
| Main chat | LLM prompt: injury + crisis blocks, EN + Hinglish | iCall + KIRAN + 112 | ✅ |
| Quick chat | Same full blocks (fixed `bb4e4d0`) | iCall + KIRAN + 112 | ✅ |
| Body Reset | Client keyword list (EN+HI) on free text | 112 + KIRAN + iCall | ✅ |
| Self-Talk | Server LLM `safety_flag` | **iCall only** | 🟡 |
| Bounce Back | Self-report (intensity 5) → safety screen | **iCall + 112, no KIRAN** | 🟡 |
| Debrief | Abuse-word inline nudge, **no helpline** — yet most free text | — | 🟡 |
| MFS check-in | **Nothing** — a kid scoring 1/5 across the board gets zero surfacing | — | ❌ |
| Before You Play / Visualization | Nothing (preset inputs, defensible) | — | ok |

**Gaps, in order:**
1. **No age gate / parental consent** (detailed in §C.1). Minimum viable: DOB at signup → under-18 requires guardian email → consent link → `guardianConsentAt` timestamp on User. Not bulletproof DPDP compliance, but defensible intent vs. today's nothing. Get legal input on whether checkbox-attestation suffices.
2. **No safety-event persistence.** Add a `SafetyEvent` table (userId, surface, triggerType, createdAt — **no message content**, data-minimal) written from: Self-Talk flag, Body Reset keyword hit, Bounce Back intensity-5, and a server-side post-hoc check on chat responses containing the helpline numbers. Surface count in founder pulse. **Also fix `founder.js:59`** (`safetyFlag: true` → `safetyFlag: 'needs_support'`).
3. **Unify helplines:** one shared constant → iCall 9152987821 + KIRAN 1800-599-0019 + 112 everywhere (Self-Talk screen, Bounce Back screen, Debrief nudge, chat header info popup).
4. **MFS floor rule:** client-side, zero AI — if avg ≤2 or selfTalk=1, append a gentle support line + helpline to the result screen.
5. **Positives to keep:** no diagnosis anywhere; boundaries in prompt (not doctor/therapist, never medication); low-shame streak copy; safety overrides format/language rules; data minimization is decent (no phone, no location, no school).

---

## J. Data / Personalization Audit

**Collected:** email, name, password, sport, competition/experience level, challenge, goals, language, optional age; per-tool: MFS 7 dims daily, debrief text, self-talk cards, body-reset sessions, game scores, chat messages, extracted memories.

**The personalization pipeline is architecturally right and better than the UI suggests:**
- ToolReports (last 3, 7 days) + MFS (today + 7-day trends + report) + debriefs + memories + profile all injected into the prompt.
- Memory extraction every 5th message.

**Weak spots:**
- **Self-Talk cards reach coaching only as a one-line ToolReport summary** — the actual focusWord/powerLine are never queried in `chat.js`. Cheap fix: select the active match-day card into the prompt (one query).
- **Cue word is stored on User and injected ✅, but its UI ownership is split** across BYP (set) / Ritual (view) / Dashboard (localStorage copy!) — `Dashboard.jsx:99` reads `localStorage arjun_cue_word_${id}` rather than the server value. Single-source it.
- **OCEAN is dead and its one reader is buggy** (reads fields the query never selects — always undefined). Delete the reader; leave the columns inert.
- **CheckIn model is vestigial** — kept alive only by MFS dual-write. Fine for MVP; fold later.
- **Quick-chat "zero footprint" is intent, not guarantee** — killed browser = messages persist. Acceptable if the copy stays honest ("Won't be saved or remembered" slightly overpromises; consider "Not used for coaching memory").

**Minimal MVP personalization model (you already have it — just wire the gaps):** User profile + UserMemory + ToolReport + MentalFitnessEntry + active SelfTalkCard + cueWord. Nothing new to build.

---

## K. Technical Audit (current state, post-fixes)

**Fixed since AUDIT.md:** quick-chat safety ✅ · trial gates (2-tier) ✅ · selective deletion ✅ · CSS vars ✅ · main-chat resume ✅.

**Still open, ordered by risk:**
1. **No rate limiting** — nothing on /login, /register, /forgot-password, or any AI endpoint. `express-rate-limit` on auth (5/15min) + AI routes (30/min/user) is an afternoon.
2. **CORS `origin: true`** (`index.js:27`) — use `CLIENT_URL` allowlist.
3. **Webhook not idempotent** (`payments.js`) — replayed `subscription.charged` re-runs updates; webhook also swallows all errors and returns 200, so a failed DB write is silently lost. Add a `ProcessedWebhookEvent` (eventId unique) guard.
4. **`Message` has no index at all** — hottest table, queried by chatSessionId/userId/createdAt constantly. `@@index([chatSessionId, createdAt])` + `@@index([userId, createdAt])`. Additive, safe.
5. **Non-atomic multi-step deletes** — account deletion + selective deletes run sequential deleteMany outside `$transaction`; mid-failure = partial state.
6. **Founder safety metric bug** (`founder.js:59`) — String column, boolean predicate, always 0.
7. **Duplication:** Anthropic client instantiated inline 10×; IST-date idiom reimplemented 5×; XP awarding bypasses `awardXP` in 5 places; trial-window computed twice. Consolidate opportunistically, not as a project.
8. **Silent catches** — many `catch {}` blocks discard errors entirely (auth.js ×7); no Sentry. At minimum log the error object.
9. **Client bundle is 1.0 MB** (one chunk). Route-level code-splitting (`React.lazy` on tool pages) would meaningfully help first load on mid-range Android.
10. **Client-side XP in BYP** (`setXpEarned(15)`) — cosmetic-only today, but the pattern invites drift; award server-side via the wizard/cue endpoints.
11. **Body Reset pause bug** — `togglePause` → `startTimer()` resets counters.
12. **Stale docs** — AUDIT.md/CLAUDE.md still describe RED 1–4 as open; PROJECT.md/PLAN.md describe previous eras. Reconcile so future sessions (and collaborators) trust the docs.

**Deployment readiness:** Vercel + Railway pipeline works; `prisma db push` on start is acceptable at this scale (migrate to `migrate deploy` before real traffic). Health endpoint exists. No Sentry/analytics (privacy policy currently accurate about that).

---

## L. Recommended MVP Structure

**Positioning line for everything:** *"Arjun trains your mental game — before you play, after a mistake, and after the match."*

**Dashboard = today (4 elements, nothing else):**
1. MFS card (do it / today's result + recommended tool)
2. Two moment buttons: **"Before you play"** → BYP · **"Rough moment?"** → Bounce Back
3. Chat with Arjun
4. Streak pill

Move Visualization/cue-word/trial-upsell cards off the dashboard. Match Day card merges into BYP.

**Train = full library**, exactly as its current taxonomy (Match Prep / Recovery / Reflection / Reps) — this is already the best-organized screen in the app. Remove the duplicate "Cue Word Builder" card (same destination as BYP) and the "Weekly Review" pseudo-tool (it's Progress).

**Tools (7 + deck + games):** Breathing · Body Reset (shortened) · Bounce Back · Before You Play (absorbs Ritual) · Debrief · Visualization · Self-Talk (+Focus Deck) · Mental Reps. **Add nothing.**

**Chat:** one ongoing main thread (done) + quick mode. Render `[SUGGEST:]` chips. Delete dead session-type code.

**Reports as memory:** already true via ToolReports — make it visible by having Arjun's first message after a tool completion reference it (the data is already in the prompt; it's a prompt nudge, not a feature).

---

## M. Prioritized Roadmap

### Must fix before MVP launch
| # | Change | Why | Impact | Effort | Risk | PR |
|---|---|---|---|---|---|---|
| 1 | DOB at signup + guardian consent flow for &lt;18 (`guardianEmail`, `guardianConsentAt` on User; consent email via Resend) | DPDP; you market to minors | Legal viability | M (2–3 d) | Low — additive schema | PR-1 |
| 2 | SafetyEvent table + writes from 4 surfaces + fix `founder.js:59` + count in pulse | You can't see incidents today | Operator safety visibility | S (1 d) | Low | PR-2 |
| 3 | Shared helpline constant: iCall+KIRAN+112 on Self-Talk, Bounce Back, Debrief nudge, chat info popup | Inconsistent crisis info to minors | Safety | S (2–3 h) | None | PR-2 |
| 4 | MFS low-score support line (client rule, no AI) | Lowest-scoring kids currently get nothing | Safety | S (1–2 h) | None | PR-2 |
| 5 | Rate limiting: auth 5/15min, AI 30/min/user | Brute force + Anthropic cost attack | Cost/security | S (½ d) | Low | PR-3 |
| 6 | CORS allowlist from CLIENT_URL | Open origin + credentials | Security | S (1 h) | Low — verify PWA origin | PR-3 |
| 7 | Webhook event-ID dedup table | Replay corrupts subscription dates | Billing integrity | S (½ d) | Low | PR-3 |
| 8 | Body Reset pause bug | Pause restarts the session | Broken core flow | S (1–2 h) | None | PR-4 |
| 9 | Games section i18n (EN+HI namespace) | Hindi users hit an English wall | Half your market | S (½ d) | None | PR-4 |

### Should fix soon (first 2–4 weeks post-launch)
| # | Change | Why | Effort | PR |
|---|---|---|---|---|
| 10 | Render `[SUGGEST:]` chips in chat | Already generated+parsed; teens don't know what to type | S | PR-5 |
| 11 | Dashboard restructure to 4 elements; kill duplicate entry points; unify tool icons | The "what do I do now" problem | M | PR-6 |
| 12 | Onboarding: merge competition+experience steps (5→4); surface MFS as forced first action | Faster time-to-value | S | PR-6 |
| 13 | Hardcoded-string sweep → translations (Landing install, Dashboard labels, Account maps, Auth headings) + Hindi तुम register pass + de-champion copy pass | i18n integrity + voice | M | PR-7 |
| 14 | `Message` indexes; wrap deletes in `$transaction`; server-side BYP XP | Perf + integrity | S | PR-8 |
| 15 | ProtectedRoute spinner; Mental Game Profile error state; Progress error string i18n | Polish | S | PR-8 |
| 16 | Remove WhatsApp placeholder row, dead OCEAN reader, orphaned drills route decision, stale docs (PROJECT.md/PLAN.md; refresh AUDIT.md/CLAUDE.md) | Dead weight + doc trust | S | PR-8 |

### Nice to have later
Route-level code splitting (1MB bundle) · design-token consolidation (one blue, retire purple/teal drift) · single shared breathing component · shared Anthropic client + IST util · Sentry · weekly-report cron · data export endpoint · Ritual→BYP merge · desktop nav row · parent-facing explainer page.

### Do not build yet
WhatsApp reminders · more games · leaderboards/social · OCEAN personality test · analytics (PostHog) until the privacy policy is updated with it · voice/audio features · any new tool.

---

## N. Suggested PR Plan

1. **PR-1 `feat: age gate + guardian consent`** — schema (dob, guardianEmail, guardianConsentAt), register validation, AuthPage DOB field, consent email + confirm endpoint, block coaching for unconsented minors (soft-gate: allow browse, gate chat/tools).
2. **PR-2 `feat: safety visibility`** — SafetyEvent model, writes from Self-Talk/Body Reset/Bounce Back/chat post-check, helpline constant + 4 surface updates, MFS floor rule, founder.js metric fix.
3. **PR-3 `hardening`** — express-rate-limit (auth + AI), CORS allowlist, webhook dedup table.
4. **PR-4 `fixes`** — Body Reset pause, Games i18n, step-count label ("/7"→ real), MFS done-CTA consistency.
5. **PR-5 `feat: suggestion chips`** — render parsed suggestions as tappable chips under Arjun's reply.
6. **PR-6 `ux: dashboard + onboarding`** — 4-element dashboard, entry-point dedup, icon unification, onboarding merge, MFS-first flow.
7. **PR-7 `content`** — hardcoded-string sweep, Hindi register pass, champion-cliché rewrite.
8. **PR-8 `tech-debt`** — indexes, transactions, server XP, loading/error states, dead-code removal, doc refresh.

PR-1→4 are the launch gate. 5–8 are sequenced by user impact.

---

## O. Questions to Answer Before Implementation

1. **Consent mechanism:** is checkbox + guardian-email confirmation acceptable for DPDP, or do you need stronger verification? (Needs a legal opinion — this shapes PR-1's design.)
2. **Under-13s:** privacy policy says no under-13 collection. Hard-block at DOB, or soft floor at 13?
3. **Ritual page:** merge into Before You Play, or keep standalone? (I recommend merge.)
4. **Desktop:** explicitly mobile-only PWA, or add minimal desktop nav?
5. **Games tab:** keep as 6th BottomNav tab, or fold under Train to tighten nav to 5? (You just added it — but if simplification wins, Train is its natural home.)
6. **`[SUGGEST:]` chips:** render (recommended) or strip from the prompt to save tokens? Pick one — the current generate-and-discard is the worst option.
7. **Score framing:** lead MFS with word labels ("In Form") and demote the /100 number?
8. **Accent decision:** one brand blue `#185FA5` + amber everywhere, retiring teal (Body Reset) and purple (Self-Talk)?
9. **Daily-drill backend:** delete, or is a "drill of the day" card planned?
10. **Quick-chat promise:** keep "won't be saved" copy (slightly overpromises) or soften to "not used for coaching memory"?
