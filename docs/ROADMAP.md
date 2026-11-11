# Arjun — Roadmap: MVP and beyond

**Written:** 2026-11-11 · **Status:** Proposal — needs founder approval before any build work.
**Replaces:** `PLAN.md` (stale). Product rules still live in `docs/ARJUN-MVP-SPEC.md`.

---

## 1. What the research says

### Inside the product (code review)

| Finding | Detail |
|---|---|
| Coach is the product | Diagnose → one practice → follow-up works end to end. Pressure Reset, Focus Cards and Mind Journal are solid. |
| The loop is invisible outside the chat | Home is the same every day. It does not show the practice Arjun gave or a way to continue the conversation. |
| The progress surface is gone | The spec made the Mental Playbook the athlete's one progress screen. Playbook was later retired and nothing replaced it. |
| Ritual cannot be run | Spec §4.7 expects a pre-performance prep flow of ≤4 minutes. Today a routine can be built and saved, but not walked through. |
| Quick Rep is a fixed script | Same preset choices every time, no history. The spec paused its "daily habit" framing, yet it sits on Train as a standalone tile. |
| Games, skill paths, Visualization are hidden on purpose | Spec §8 puts them out of scope for the pilot. They are not "missing links" — leave them hidden. |
| The pricing page promises things that no longer exist | "Daily check-ins & mood tracking", "progress charts", "Focus games & mental drills" are all retired. |
| Weekly Review and push reminders were built although the spec deferred them | Weekly Review is live (first one after 7 days). Push is opt-in and generic. Both touch the legal question in §1 below. |

### Outside the product (market, evidence, law)

| Finding | What it means for Arjun |
|---|---|
| Similar apps abroad charge about US$5–14 a month (Restoic, Perform, Optimize Mind, Focus 5) | ₹299/month is reasonable. Price is not the main risk. |
| No India-first AI mental coach for young athletes turned up; the closest are human consultancies with apps (Samiksha Sports, Mindsports) | Open space, but also an unproven market — the pilot matters more than features. |
| Mental-health apps keep a median of ~3% of users at day 30; stand-alone breathing apps keep ~0% (Baumel et al., 2019) | Tools alone do not bring people back. The coach relationship and the follow-up on real matches are the reason to return. |
| The median subscription app turns ~2% of installs into payers (RevenueCat 2026, via secondary summaries) | Plan for low conversion. The trial must show clear personal value by day 14. |
| India's DPDP Rules: verifiable parental consent and a bar on tracking/behavioural monitoring of under-18s apply from about May 2027 | Email-only guardian consent, the Weekly Review, memories and "last seen" tracking need a lawyer's review before paid launch. |

Web research was a short pass using secondary sources. Benchmarks and legal dates are directional; confirm the legal points with a lawyer.

---

## 2. Guiding rule

The pilot succeeds only if athletes **come back on their own** and say they **used a practice in real sport** (spec §7). Every item below is judged against that. Nothing is added just to make the app look fuller.

---

## 3. Phase 1 — Finish the MVP (about 2–3 weeks of build)

Goal: make the coaching loop visible and usable outside the chat.

| # | Change | Why | Size |
|---|---|---|---|
| 1.1 | **Home shows "Your current practice"** (what Arjun gave, when to use it, one tap to do it) and **"Continue with Arjun"** | Home becomes personal and pulls the athlete back into the loop | Medium — one new read-only endpoint |
| 1.2 | **"My practice" screen** — a simple log: practices given, done, how it went, saved cues and routines. No scores, charts or streaks | Restores the progress surface the spec requires | Medium |
| 1.3 | **Ritual "Start routine" walkthrough** — one step per screen, under 4 minutes | Delivers spec §4.7; a routine you cannot run is half a feature | Medium |
| 1.4 | **Pressure Reset sound + vibration cues** | Athlete can breathe eyes-closed instead of watching the screen | Small |
| 1.5 | **Quick Rep: use the athlete's sport and saved focus word, show last reps; reach it mainly through Coach** | Stops it feeling like a generic quiz | Medium |
| 1.6 | **Pricing page lists only real features** | Honest paywall | Small |
| 1.7 | **Weekly Review reachable from Home/Profile**, with an honest empty state for week 1 | It is currently buried in the chat menu | Small |

Order: 1.6 → 1.1 → 1.3 → 1.2 → 1.4 → 1.7 → 1.5. Each is its own PR with a Vercel preview.

---

## 4. Phase 2 — Run and read the pilot (2–3 weeks, little build)

| # | Item |
|---|---|
| 2.1 | Founder dashboard: per athlete — days active in week 2–3, practice given / done / reported useful |
| 2.2 | End-of-pilot guardian and athlete debrief (5 questions, by phone or in person) |
| 2.3 | Classify the result as **promising / weak / inconclusive** using spec §7. Weak or inconclusive → fix the cause and rerun; do not move to Phase 3 |

---

## 5. Phase 3 — Paid-launch readiness (only after a promising pilot)

| # | Item | Why |
|---|---|---|
| 3.1 | Access check on all AI endpoints (summaries, Weekly Review, debrief, journal review, profile wording) | Otherwise unpaid users keep costing AI money |
| 3.2 | Account deletion must not leave a live Razorpay subscription | Billing someone who deleted their account |
| 3.3 | Guardian is the payer for under-18s (spec gate G2) | Minors cannot contract |
| 3.4 | Lawyer review for DPDP: stronger guardian verification; whether Weekly Review, memories and activity tracking count as behavioural monitoring | Applies from about May 2027 |
| 3.5 | Trial design: a day-12 "your two weeks with Arjun" summary before the paywall | Shows value at the moment of the decision |
| 3.6 | `Message` index and a message-retention policy | Speed and privacy at scale |
| 3.7 | Professional sign-off on the safety protocol kept current (spec G5) | Required before wider release |

---

## 6. Phase 4 — Beyond MVP (choose with pilot evidence, one at a time)

| Bet | Idea | Do it when |
|---|---|---|
| Match calendar | Athlete enters upcoming matches; Arjun offers prep the day before and a reflection after | Athletes say they forgot to use Arjun around matches |
| Guided rehearsal inside Coach | Bring the existing Visualization back as a prescribed practice | Coach keeps prescribing imagery in chat |
| Academies and coaches channel | Academies invite athletes; guardian pays; coach sees nothing private | Recruiting single athletes is too slow |
| Sport packs | Deeper cricket-first wording, then badminton, football, athletics | One sport dominates sign-ups |
| Play Store app | Wrap the web app for Android | Install friction shows up in sign-up data |
| Hindi screens | Switch `HINDI_ENABLED` on | Athletes or guardians ask for it |
| Parent summary | Opt-in, athlete-approved, non-private monthly note | Guardians ask what they are paying for |

**Not planned:** games on Train, streaks/XP/badges, scores or ratings of the athlete, leaderboards or any social comparison, a content library. The spec rules these out and the retention evidence does not support them.

---

## 7. Decisions needed from the founder

1. Where is the pilot now — not started, running, or finished? (Decides whether Phase 1 ships before or during it.)
2. Approve Phase 1 items and order.
3. Keep games, skill paths and Visualization hidden (recommended), or re-open that spec decision?
4. Weekly Review and push reminders: keep live during the pilot, or pause until the DPDP review?

---

## Sources

- Baumel et al. 2019, JMIR — https://pmc.ncbi.nlm.nih.gov/articles/PMC6785720
- RevenueCat State of Subscription Apps — https://revenuecat.com/state-of-subscription-apps-2025
- Restoic — https://apps.apple.com/app/id1557936632 · Perform — https://apps.apple.com/us/app/perform-ai-sport-psychology/id6504174336 · Optimize Mind — https://apps.apple.com/us/app/id1633065262 · Focus 5 — https://apps.apple.com/us/app/id1613789297
- Samiksha Sports — https://samikshasports.dev.seraphic.io · Mindsports — https://influentialcoaches.com/?p=10757
- DPDP Rules 2025 — https://www.legal500.com/firms/237811-saga-legal/c-india/news-and-developments/the-privacy-timer-starts-now-analysing-the-dpdp-rules-and-its-18-month-countdown · https://www.orfonline.org/expert-speak/dpdp-rules-and-the-future-of-child-data-safety
