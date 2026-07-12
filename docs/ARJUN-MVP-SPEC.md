# ARJUN MVP SPECIFICATION

**Version:** 1.2 · **Date:** 2026-07-12 · **Status:** Approved — Frozen MVP
**Source of truth:** `arjun-mvp-research-pack.md` (frozen MVP decision + three research reports)
**Standing rule:** Scope is frozen. Any proposed addition is a post-launch conversation by default. This spec defines what ships to the 5-athlete pilot — nothing more.

---

## §0. Document status

This specification turns the frozen MVP decision into implementation-ready definition. It does **not** contain the engineering plan (task breakdown, file-level changes, sequencing) — that is produced separately after this spec is approved. Where a requirement already exists in the app, the spec says so; where current behaviour must change, it is listed as a **gate** (§6) or marked **[CHANGE]**.

Decisions resolved at approval: next-open follow-up only (no notifications in pilot) · Quick Chat hidden, not deleted · Mental Rep = prescription-delivery mechanism, daily-habit framing paused · pilot is free, guardian consent still mandatory · focus & mistake-recovery mapped to routines + cues, not games · strict one-prescription rule (no pairing exceptions) · hybrid AI-assisted + founder-led safety review with pre-pilot professional protocol review · pilot results classified as promising/weak/inconclusive, never as market validation · file lives at `docs/ARJUN-MVP-SPEC.md`.

Decisions resolved 2026-07-12 (v1.2), following the pre-pilot engineering gap review: SafetyEvent stores structured fields only — safety category, risk level, surface, timestamp, athlete/user reference, chat/session reference, review status and review timestamp — never message content or a persistent AI-written narrative (a temporary AI-assisted summary may be generated for founder review but is not saved) · pre-performance preparation uses the existing dedicated Ritual flow, not the Mental Rep flow · the Progress tab is hidden for the pilot, with the Mental Playbook as the athlete's sole progress-review surface (old Progress code may remain dormant, undeleted) · backend XP accrual may continue silently but is fully invisible to athletes, does not gate anything, and is never a success metric or coaching input.

## §1. Product definition

**Arjun is an AI coaching conversation that helps a skilled young athlete perform closer to their training level when it counts.** The athlete brings a real performance problem; Arjun asks focused questions, identifies the likely mental barrier, explains it in plain language, prescribes exactly one practice, and follows up after the athlete has applied it in real training or competition.

**The athlete:** Indian, 14–17 (product supports up to 25), skilled in training but underperforming under pressure and evaluation. Stigma-aware positioning: *performance training, not therapy* — always.

**Success:** unprompted return. The pilot's purpose is to produce the first honest evidence about whether real athletes return on their own because Arjun helped them perform (interpretation rules in §7).

## §2. The core coaching loop

The six stages. Every product surface exists to serve this loop.

| # | Stage | What happens | Surface |
|---|---|---|---|
| 1 | **Athlete shares a problem** | Real performance situation in their own words (EN/Hinglish) | Main chat |
| 2 | **Focused questions** | Arjun asks 2–4 targeted questions (§5.1) | Main chat |
| 3 | **Likely barrier** | Arjun names ONE probable barrier as a hypothesis and checks it with the athlete | Main chat |
| 4 | **Brief explanation** | 1–2 lines max: what the barrier is, why it's normal and trainable | Main chat |
| 5 | **One prescription** | Exactly one practice, delivered as a Mental Rep via a tool card or as chat-coached homework | Chat → tool surface |
| 6 | **Follow-up** | Next time the athlete opens Arjun after the practice window, the conversation resumes with the open prescription: "what happened when you tried it?" | Main chat (next-open) |

**Worked example** (normative — chat behaviour must match this shape):

> **Athlete:** "I bat well in nets but in matches I get out cheaply."
> **Arjun (stage 2):** "That gap is really common — let's find what's driving yours. When does it feel different in a match: while you're waiting to bat, walking in, or facing the first few balls?"
> **Athlete:** "First few balls. My heart races and I play at everything."
> **Arjun (2):** "What's going through your head those first balls — anything you can remember thinking?"
> **Athlete:** "Don't get out early again. Everyone's watching."
> **Arjun (3):** "Sounds like fear of failure showing up as rushing — your mind is on the wicket you might lose, not the ball coming at you. Does that fit?"
> **Athlete:** "Yes exactly."
> **Arjun (4):** "That's not a weakness — it's your brain overprotecting you, and it's trainable. The fix is giving your mind one job per ball instead of ten." *(5)* "Let's build your focus cue — one phrase you'll say before each ball. Takes 5 minutes." **[Focus Card Builder card]** After your next match or net session, come back and tell me how the first ten balls felt.
> *(Next open, stage 6):* "You were going to use your cue for the first balls — how did it go?"

## §3. Barrier model & practice set

### 3.1 The seven barriers

Pressure/nerves (body) · Focus/concentration · Harsh self-talk · Low confidence · Fear of failure/expectations · No pre-performance routine · Mistake recovery. These are Arjun's internal diagnostic vocabulary. The athlete never sees a taxonomy or a label applied *to them* — barriers are named conversationally, as a shared hypothesis.

### 3.2 Approved practice set (complete — nothing else may be prescribed)

| Practice | Prescribed for | Surface | Evidence grade | Framing rules |
|---|---|---|---|---|
| **Pressure Reset** (slow breathing + body steadying) | Pressure/nerves | `/body-reset` | Moderate (anxiety); weak as acute rescue | **Trained skill built over days–weeks** — prescribe as daily practice, never "tap when panicking" |
| **Focus cue building** (Focus Card: focus word, reset word, mantra) | Focus, self-talk, confidence | `/self-talk` | Strong-moderate; best teen evidence | Athlete's own words; instructional cues for skill moments |
| **Simple attentional routine** (notice drift → cue → next action) | Focus | Chat-coached, uses their focus word | Supported (cue + routine literature) | 3 steps max, concrete, tied to their sport's rhythm |
| **Pre-performance routine** (short personal sequence before performing) | Routine absence, fear of failure, pressure | Pre-match prep flow + chat | **Strong — best-evidenced pressure tool** | Behavioral, short, athlete-designed, rehearsed in training first |
| **Mistake reset routine** (breath → reset word → next action) | Mistake recovery | Chat-coached; reset word from Focus Card | Supported (routine + cue evidence) | Seconds long; practised in training before matches |
| **Brief guided rehearsal** (short imagery of a specific moment) | Confidence, fear of failure | Guided in chat / prep flow | Strong-moderate (youth d≈0.49) | Short, simple, guided; verify the athlete can actually form images |
| **Post-performance reflection** | All (after application) | `/debrief` | Weak-indirect — development tool | Short, mastery-focused; never marketed as pressure-evidence-based; anti-rumination framing |
| **Acclimatization homework** (add mild pressure to practice: being filmed, small stakes, audience) | Fear of failure, pressure, mistake recovery | Chat-prescribed real-world homework — **no app surface** | **Strong** (choking literature) | Mild, consented, athlete-chosen stakes; debriefed at follow-up; **a full standalone prescription in its own right** |

**Rules:** Exactly one prescription per problem cycle (§5.4) — acclimatization homework is itself a valid single prescription when it best fits the confirmed barrier. Games are **not** prescription targets in the pilot. If no practice fits, Arjun coaches conversationally and prescribes nothing — a null prescription is valid.

## §4. User flows

Format per flow: **Entry → Steps → Exit → Data written → Acceptance criteria (AC)**.

### 4.1 Onboarding + guardian consent
**Entry:** New user at signup. **Steps:** (1) Age collected at registration. (2) If under 18 → guardian consent flow: guardian identified as the consenting adult, consent recorded; for the pilot, in-product consent is **backed by an offline signed consent form + guardian ID sighting by the founder** (Rule-10-grade digital verification is a post-pilot launch requirement). (3) Sport, level, goals, language. (4) AI disclosure shown plainly: Arjun is an AI coach, not a human and not a therapist (Anthropic policy requirement — binding now). (5) Lands on dashboard.
**Exit:** Athlete can start the first conversation. **Data:** account, age, guardian consent record, profile.
**AC:** Under-18 signup cannot reach chat without a recorded guardian consent · AI disclosure is unmissable during onboarding (not buried in ToS) · total time for a real 15-year-old ≤ 5 minutes · pilot: signed guardian form on file for all 5 athletes before first login.

### 4.2 First coaching conversation
**Entry:** First chat open. **Steps:** Arjun introduces itself in ≤3 short messages: what it is (AI performance coach), what it's for (converting skill to performance), what it isn't (therapy — with helpline pointer), then invites the problem: "What's the situation where your game doesn't come out the way you train?"
**Exit:** Athlete has shared a first problem or a starting point. **Data:** messages, session.
**AC:** intro ≤3 messages, then a question · AI + not-therapy disclosure present in the intro · no tool prescribed before at least one focused question is answered · works in EN and Hinglish.

### 4.3 Barrier identification
**Entry:** Problem shared. **Steps:** 2–4 focused questions (§5.1) → ONE barrier hypothesis in plain language, framed as "sounds like… does that fit?" → athlete confirms or corrects; if corrected, at most 2 more questions, then re-hypothesize.
**Exit:** Athlete-confirmed working barrier. **Data:** conversation; barrier noted in session context.
**AC:** never more than 4 questions before a hypothesis · hypothesis is a check, not a verdict · exactly one barrier at a time · no clinical/diagnostic vocabulary, no deficit framing ("mental weakness" etc. never appears).

### 4.4 Practice prescription
**Entry:** Confirmed barrier. **Steps:** 1–2-line explanation (why this happens, that it's trainable) → exactly one practice from §3.2 with the *why* attached in one line → delivered as tap-to-open tool card where a surface exists, or as concrete homework instructions in chat (attentional routine, mistake reset, acclimatization) → Arjun states the follow-up contract: "try it in [real situation]; when you're next here, tell me what happened."
**Exit:** Open prescription exists. **Data:** prescription record (practice, barrier, prescribed-at, status: open).
**AC:** exactly one recommendation — never a menu, never a second practice in the same cycle · explanation ≤2 lines · every prescription names the real-world application situation · a null prescription (coach-only conversation) is permitted and leaves no open record.

### 4.5 Mental Rep completion
**Entry:** Athlete opens the prescribed tool. **Steps:** Completes the existing tool flow (Pressure Reset / Focus Card / the dedicated Ritual pre-performance flow, §4.7 / debrief / guided rehearsal). Output artifact (cue, card, routine, reflection) is saved.
**Exit:** Rep done; artifact in Playbook; prescription status: practised (still open until discussed at follow-up). **Data:** tool report, artifact, prescription update.
**AC:** completing a prescribed tool always writes to the Playbook · Arjun's next conversation knows the rep happened · no XP/score/streak surface appears anywhere in the pilot experience · **[CHANGE]** dashboard shows no daily-rep obligation (daily-habit framing paused).

### 4.6 Follow-up conversation
**Entry:** Athlete opens chat while a prescription is open (next-open rule — **no push notification, no manufactured reminder**). **Steps:** Arjun opens with the prescription: asks what happened when they applied it in the real situation → athlete reports → Arjun coaches on the result: worked (reinforce, extend), partially (adjust the same practice), didn't (revisit barrier hypothesis, may re-prescribe once) → prescription closed with outcome; lesson offered to Playbook.
**Exit:** Prescription closed (worked / partial / didn't / abandoned). **Data:** prescription outcome, optional Playbook lesson.
**AC:** with an open prescription, the follow-up is Arjun's *first* conversational move on next open · outcome recorded before any new problem/prescription cycle begins · a "didn't try it yet" response keeps the prescription open without shame language ("progress comes from returning" tone, never guilt).

### 4.7 Pre-performance preparation
**Entry:** Athlete opens the dedicated pre-performance preparation flow (Ritual) ahead of a match/session (internal trigger — never a notification). **[RESOLVED 2026-07-12]** The pilot uses this existing dedicated flow, not the general Mental Rep flow — Mental Rep stays reserved for chat-prescribed practice. **Steps:** Short flow, dedicated to the upcoming moment: settle (breathing, if trained) → their saved focus cue → their personal routine → one-line intention. Under approximately 4 minutes.
**Exit:** Athlete leaves the app for their sport. **Data:** prep completion, cue used.
**AC:** completable in ≤4 minutes · surfaces *their* saved cue/routine (personalized, not generic) · ends by sending the athlete out of the app, not deeper in · the flow may be improved during implementation but must not expand into a course, content library, or complex routine builder.

### 4.8 Post-performance reflection
**Entry:** Athlete opens debrief after a match/session. **Steps:** Existing debrief flow: what went well → what to do differently → next focus; Arjun adds one short insight. Mastery-focused, brief.
**Exit:** One usable lesson. **Data:** debrief record, insight → Playbook.
**AC:** ≤4 minutes · output is exactly one next-focus lesson · anti-rumination: no dwelling loops, no re-litigating the whole match · feeds the follow-up conversation if a prescription is open.

### 4.9 Mental Playbook
**Entry:** From dashboard/nav. **[RESOLVED 2026-07-12]** With the Progress tab hidden for the pilot (§7), the Playbook is the athlete's **only** pilot-facing place to review progress: cues and Focus Cards, completed practices, prescription outcomes, and reflection lessons. **Steps:** Read-only review of *their* accumulation. **Portable by design** — valuable even if they stop using Arjun.
**Exit:** Athlete reviews before training/matches. **Data:** none (read).
**AC:** everything the athlete built is present and correct · zero comparative/scoring elements · empty state explains what will accumulate, without shame · no XP, streak, badge, level, score, or rating appears anywhere in this view.

### 4.10 Safety escalation
**Entry:** Any chat message hitting a red-line topic (§5.6). **Steps:** Coaching stops → warm, non-judgmental safety response → helplines surfaced (iCall 9152987821, KIRAN 1800-599-0019, emergency 112) → conversation does not continue coaching the topic → **SafetyEvent logged as structured data only (safety category, risk level, surface, timestamp, athlete/user reference, chat/session reference, review status and review timestamp — never message content or a persistent AI-written narrative) [RESOLVED 2026-07-12] → during founder review, AI may generate a temporary summary from the referenced conversation to assist the review, but this summary is never saved permanently → founder reviews flagged conversations same-day (pilot SLA) → serious or unclear cases escalated to the named safety-protocol professional via the agreed contact arrangement (§6 G5) → guardian escalation per the consent-form protocol for imminent-risk events.**
**Exit:** Athlete has help pathways; event awaiting human review. **Data:** structured safety event record only (no persisted message content or AI narrative).
**AC:** triggers on all red-line categories, EN + Hinglish · helplines on every safety surface (KIRAN included — closes the known gap) · zero safety events reach coaching continuation · every event is logged as structured data and founder-reviewed same-day during the pilot · no incident summary or message content is ever stored permanently · serious/unclear cases have a defined escalation path with expected response time — **no 24/7 availability is implied anywhere** · guardian protocol documented in the signed consent form · **applies to 100% of live chat surfaces** (see gate G4).

### 4.11 Data deletion
**Entry:** Account page. **Steps:** Full deletion: existing flow (Razorpay cancel → messages → sessions → cascade → confirmation email). Selective deletion: **[CHANGE — gate G7]** "check-in history" must delete *all* check-in data including `CheckIn` rows with free text, not only `MentalFitnessEntry`.
**Exit:** Data verifiably gone. **Data:** audit log only.
**AC:** full deletion leaves no orphaned user data · selective check-in deletion leaves no check-in free text feeding the prompt · deletion reachable in ≤3 taps from account · pilot data has a committed deletion date in the pilot protocol.

## §5. Chat behaviour specification

**5.1 Question repertoire (stage 2).** Questions probe, in order of priority: *when/where* the problem appears (situation specificity) · *what it feels like* (body/thoughts — their words) · *what they're thinking* at the moment · *what happens next* (behaviour) · *what they've tried*. Max 4 questions before Arjun must hypothesize. One question per message.

**5.2 "Enough information" rule.** Arjun hypothesizes when it has: a specific situation + either a thought pattern or a body pattern. It never waits for certainty.

**5.3 Overdiagnosis guards.** Hypothesis language only ("sounds like", "I think what might be happening") · one barrier at a time · athlete confirmation required before prescription · Arjun may say "I'm not sure yet — tell me about the next match and we'll look again" · barriers are behaviour patterns, never identity statements about the athlete.

**5.4 One recommendation only.** Exactly one practice per problem cycle — no exceptions, no pairings, never a menu, never "you could also try". Acclimatization homework is itself a valid single prescription when it best fits the confirmed barrier. A second practice requires the current prescription to be closed at follow-up first.

**5.5 Follow-up logic.** Open prescription + new session → follow-up is the opening move. Athlete deflects → Arjun honors the new topic, returns to the follow-up once, then lets it go (logged as abandoned after 2 deflections — no nagging). "Didn't do it" → normalize, re-commit or re-scope smaller, keep open.

**5.6 Performance vs clinical boundary.** Red lines (route out, never coach through — bar set LOW for minors): suicidality/self-harm · abuse or harassment, including by coaches/parents · disordered eating or weight-control behaviour · panic/anxiety persisting outside sport · depression signs (persistent low mood, anhedonia, sleep collapse) · substance use · playing through/concealing injury or concussion · threats to others · grief/trauma. Ambiguity resolves toward the helpline. In-scope: nerves, focus, confidence, motivation, pressure, mistakes, expectations — *in sport contexts*.

**5.7 Tone rules (evidence-derived).** Concrete, example-based language a 14-year-old gets · pressure responses framed as normal and trainable, never as flaws · no "mental toughness/weakness" vocabulary · whole-person framing — never "you ARE your sport" · validate parent/coach pressure without amplifying it · track practices done, never rate the person · recurring lightweight AI-disclosure reminders in long sessions; break nudge after extended continuous chat (SB 243 pattern, adopted as good practice).

## §6. Safety & pre-pilot launch gates

Every gate must pass before athlete #1 logs in. **Requirement → current state → pass condition.**

| # | Gate | Current state | Pass condition |
|---|---|---|---|
| G1 | Guardian consent, verifiable (pilot-grade) | Consent flow built; verification strength unconfirmed | Signed guardian form + ID sighting for all 5; in-product consent recorded; flow verified to block minors without consent |
| G2 | Guardian as contracting party | Pilot is free — deferred | Specified for paid launch: ToS name guardian as subscriber/payer for under-18s (spec'd now, built post-pilot) |
| G3 | AI disclosure (Anthropic policy — binding now) | Partial ("not therapy" positioning exists) | Explicit AI disclosure at onboarding + recurring in-chat; public child-safety statement on site |
| G4 | Safety parity on every chat surface | **FAILS — Quick Chat has zero safety (RED 1)** | **[CHANGE]** Quick Chat hidden/disabled for pilot (not deleted); main chat is the only conversational surface; safety blocks verified there in EN + Hinglish |
| G5 | Safety review process (hybrid) | SafetyEvent logging built; review process undefined | **AI-assisted, founder-led, professionally anchored, privacy-preserving [RESOLVED 2026-07-12]:** (a) SafetyEvent stores structured data only — safety category, risk level, surface, timestamp, athlete/user reference, chat/session reference, review status and review timestamp — never message content and never a persistent AI-written narrative or summary; (b) during review, AI may generate a *temporary* summary from the referenced conversation to help the founder assess it, but that summary is not saved; (c) the founder reviews all flagged conversations same-day during the pilot; (d) **before the pilot**, a named qualified sport psychologist or licensed mental-health professional reviews and signs off the safety protocol; (e) a written escalation arrangement exists for serious or unclear cases — who is contacted, how (phone/WhatsApp/email), and their expected response time (e.g., within 24 hours) — with **no implication of 24/7 availability**; the arrangement and its limits are stated honestly in the pilot protocol and consent form |
| G6 | Guardian escalation protocol | Does not exist | Written protocol (what triggers guardian contact, how, by whom) included in the signed consent form |
| G7 | Working deletion | **FAILS — selective deletion leaves `CheckIn` free text (RED 3)** | **[CHANGE]** bug fixed; full + selective deletion verified end-to-end |
| G8 | No tracking/ads for minors | Passes today (no analytics/ad SDKs wired) | Keep: zero third-party analytics/ad SDKs; no targeted ads ever; memory/reports documented as user-requested service features, user-visible and deletable |

## §7. MVP readiness checklist

**Pilot definition:** 5 athletes, aged 14–17, recruited via the founder's coaching network; 2–3 weeks; free access; guardian-consented; purpose = produce the first honest evidence of voluntary, useful, performance-connected use.

**Ready when all are true:**
1. Gates G1–G8 pass (G2 spec-only).
2. Onboarding ≤5 minutes for a real teenager on a real phone.
3. The full coaching loop works end-to-end: problem → questions → barrier → one prescription → rep completion → Playbook entry → next-open follow-up.
4. Pre-performance prep and post-performance reflection run ≤4 minutes each on mobile.
5. All pilot-visible copy passes the tone rules (§5.7) in EN and Hinglish.
6. Paused features are invisible to pilot athletes: games, skill paths, streaks/XP/badges/levels/scores/ratings/milestones/reward animations, weekly reports, visualization entry points, daily-rep dashboard obligation, Quick Chat, and **[RESOLVED 2026-07-12]** the entire Progress tab (hidden — no pilot-visible navigation or entry point; old route/code may remain dormant, undeleted). Backend XP accrual may continue silently (to minimize backend risk) but must never be visible, must never gate or unlock anything, must never influence coaching recommendations, and must never be used as a pilot-success metric.
7. Written pilot protocol exists: scope, duration, incident-response runbook, same-day safety-review SLA, escalation arrangement (G5d), pilot-data deletion date, guardian debrief at end.
8. Safety protocol reviewed and signed off by the named qualified professional (G5c); escalation arrangement agreed and documented (G5d).
9. Athlete roster: 5 names, sports, ages, guardian contacts, signed forms.
10. Founder monitoring routine defined (daily transcript + safety-event review, AI-prepared checklists).

**Interpreting pilot results — classification, not validation:**
- **Promising:** two or more athletes return unprompted in weeks 2–3, **and** at least some returning athletes report they used the prescribed practice in real training or competition and found it useful. This is a promising early signal that justifies continued investment — **it is not proof of product-market fit.**
- **Weak:** athletes use Arjun only when asked, or returns happen but no athlete connects a prescribed practice to real training/competition use. Diagnose via follow-up conversations and guardian debriefs before building anything.
- **Inconclusive:** mixed or too-low usage to classify (e.g., athletes barely onboarded, external disruptions). Fix the obstacle, rerun — do not treat as either signal.
- Under no classification does the pilot constitute market validation; it informs the next iteration and the decision to expand testing, nothing more.

## §8. Explicitly out of scope

| Item | Why |
|---|---|
| Skill-path courses | Education-trap; loop teaches just-in-time |
| Games (Focus Lock, Reset Rally) | Practice happens in real sport; barriers remapped (§3.2) |
| Formal personality profiling / OCEAN | Post-launch bet; personality informs *tone*, not a system — **OCEAN removed, not paused** |
| Complex analytics/charts | Nothing to analyze before real usage exists |
| Streaks / XP surfaces (visible) | Healthy Hook ethics: clarity is the reward, not numbers. **[RESOLVED 2026-07-12]** Backend XP accrual may continue silently to minimize backend risk, but no XP, streak, badge, level, score, rating, milestone, or reward animation may be visible, gate any feature, affect coaching, or serve as a pilot-success metric; no new gamification functionality may be built |
| Progress tab (pilot) | **[RESOLVED 2026-07-12]** Hidden entirely for the pilot — the Mental Playbook (§4.9) is the sole athlete-facing progress-review surface; the existing Progress route/code may remain dormant, undeleted, but has no pilot-visible navigation or entry point |
| Standalone visualization tool | Rehearsal lives inside the loop as guided practice |
| Content library | Just-in-time explanation only |
| Weekly reports | Post-pilot; behavioural-monitoring ambiguity under DPDP |
| Social comparison (any form) | **Removed** — ethics red line |
| Manufactured notification triggers | **Removed** — internal triggers only; next-open follow-up |
| Score-based rewards / person-rating | **Removed** — track practice, never rate the athlete |
| Push notifications (pilot) | Follow-up is next-open only, per decision 1 |
| Payments/subscription enforcement (pilot) | Pilot free; guardian-payer structure specified for launch |

## §9. Decisions log & remaining open items

**Resolved at approval (2026-07-11):** next-open follow-up only · Quick Chat hidden not deleted · Mental Rep = prescription mechanism, daily framing paused · pilot free, consent mandatory, guardian-payer at launch · focus → cue + attentional routine, mistake recovery → reset routine + cue, acclimatization via chat homework · **strict one-prescription rule (rev 1.1)** · **hybrid safety review: AI-assisted flagging/summaries, founder same-day review, pre-pilot professional protocol sign-off, defined escalation arrangement with honest availability limits (rev 1.1)** · **pilot results classified promising/weak/inconclusive, never market validation (rev 1.1)** · spec lives at `docs/ARJUN-MVP-SPEC.md`.

**Resolved 2026-07-12 (v1.2), following the pre-pilot engineering gap review:** SafetyEvent privacy design — structured fields only (safety category, risk level, surface, timestamp, athlete/user reference, chat/session reference, review status, review timestamp); no persisted message content, no persistent AI-written incident narrative or summary; a temporary AI-assisted summary may be generated during founder review but is never saved · pre-performance preparation uses the existing dedicated Ritual flow, not the Mental Rep flow, and must not expand into a course, content library, or complex routine builder · the Progress tab is hidden entirely for the pilot; the Mental Playbook is the athlete's sole progress-review surface; the old Progress route/code may remain dormant without deletion · backend XP accrual may continue silently to minimize backend risk, but must be fully invisible, non-gating, non-coaching-affecting, and never used as a pilot-success metric — no new gamification functionality may be built.

**Open (operational, non-blocking to spec approval — blocking to pilot start):**
1. Safety-protocol reviewer: which named qualified sport psychologist or licensed mental-health professional will review the protocol pre-pilot, and the agreed escalation arrangement (contact method + expected response time).
2. Guardian consent form: drafting (covers consent, AI disclosure, escalation protocol and its availability limits, data use + deletion date) — legal-lite template acceptable for a 5-person pilot.
3. Athlete roster: the 5 names + guardian contacts (founder's action).
4. Prescription record: exact data shape (engineering plan's job; requirement fixed here: practice, barrier, status open→practised→closed, outcome).
5. Hinglish safety-block coverage verification (gate G4 pass evidence).

---

**End of specification — v1.2 (Approved — Frozen MVP).**
