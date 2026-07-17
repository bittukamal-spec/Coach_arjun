# Arjun Pilot PR Roadmap — Stages 3–10

Source of truth for the Arjun Pilot PR Loop: a deterministic, one-stage-per-PR
automation that a future Claude Code Routine follows to implement the Arjun
pilot UI work. Stages 1 and 2 are already complete on `main`. This document
defines Stages 3–10 only.

Read alongside:

- `.claude/arjun-loop-state.json` — machine-readable stage state
- `.claude/skills/arjun-pr-loop/SKILL.md` — the routine's operating procedure
- `CLAUDE.md` — repository conventions, protected systems, coding patterns

## How to read each stage

Every stage below lists: purpose, strict scope, exclusions, dependencies,
likely files, functional acceptance criteria, English/Hindi requirements,
focused test expectations, full client test + build requirements,
stage-specific founder preview checks, and protected systems that must stay
untouched. A stage is implemented in its own branch and its own draft PR, per
`SKILL.md`. No stage may begin until the previous stage is merged to `main`.

---

## Stage 3 — Minimal UI foundation

**Purpose:** Establish the smallest set of typography, spacing, colour, and
reusable primitive tokens actually needed by real screens — not a speculative
component library.

**Strict scope:**
- Typography scale, spacing scale, colour tokens actually consumed by a real
  screen.
- The smallest set of reusable primitives (e.g. button, card shell) required
  by that one reference surface.
- Apply the foundation immediately to one real reference surface so it is
  proven in place, not left abstract.
- Retain one restrained Arjun signature gradient where appropriate (not
  spread across every surface).
- Ordinary cards and list rows remain visually flat.

**Exclusions:**
- No broad redesign of Home, Train, or any tool screens.
- No large library of components without a consuming screen.
- No new dependencies.

**Dependencies:** None (first implementation stage).

**Likely files:** `client/tailwind.config.js`, `client/src/index.css`, a small
number of new primitive components under `client/src/components/`, and the
one chosen reference surface.

**Functional acceptance criteria:**
- The reference surface renders using only the new tokens/primitives.
- No other screen's visual behavior changes.
- Design tokens documented in `CLAUDE.md` §7 (Calm Clarity) remain internally
  consistent — no new colour drift introduced.

**English and Hindi requirements:**
- If the reference surface has copy changes, both `en` and `hi` entries exist
  in `client/src/i18n/translations.js`. Otherwise no translation changes are
  expected.

**Focused test expectations:**
- Any existing tests touching the reference surface still pass.
- No new test suite required unless a primitive has non-trivial logic.

**Full client test and production-build requirements:**
- `cd client && npm test` (if a test script exists) passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open the reference surface in the Vercel PR preview, English and Hindi.
- Confirm typography/spacing/colour look intentional, not broken.
- Confirm no other screen regressed.
- Check light and dark theme.
- Check ~360px, ~640px, ~768px widths.

**Protected systems:** All global protected systems below, plus: do not touch
any screen other than the single reference surface.

---

## Stage 4 — Home redesign

**Purpose:** Redesign the Home/Dashboard screen around one clear primary
action and a small, calm set of shortcuts — no gamified framing.

**Strict scope — final order:**
1. Greeting.
2. One adaptive primary action card.
3. Four "Need help right now?" shortcuts.
4. Mental Playbook row.
5. Mind Journal row.

**Rules:**
- Only one primary action card — never more.
- No automatic follow-up-opener claiming on Dashboard load.
- Dashboard may read coaching status only (read-only) — it must not claim or
  mutate follow-up-opener state.
- Follow-up opener remains claimed only after the athlete explicitly enters
  Coach.
- Preserve the four real `Link`-based shortcuts (not fake buttons).
- Shortcut messages remain visible and unsent (pre-filled, not auto-sent).
- No scores, XP, streaks, Starter Plan, games, or obligation framing anywhere
  on Home.

**Exclusions:** No changes to Train, tools, or Coach itself beyond what Home
navigates to.

**Dependencies:** Stage 3 foundation merged to `main`.

**Likely files:** `client/src/pages/Dashboard.jsx` (or equivalent Home page),
`client/src/i18n/translations.js`.

**Functional acceptance criteria:**
- Home renders the five sections in the specified order.
- Loading Home does not claim the follow-up opener (verify via network/state,
  not just visually).
- Entering Coach explicitly is what claims the follow-up opener.
- All four shortcuts navigate via real `Link` elements.
- No XP/streak/score/Starter-Plan UI present.

**English and Hindi requirements:**
- All new/changed Home copy present in both `en` and `hi` in
  `translations.js`.

**Focused test expectations:**
- Any existing Dashboard/Home tests updated and passing.
- If a test exists asserting follow-up-opener claim timing, it passes and
  demonstrates the "explicit Coach entry" rule.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Home in Vercel preview, English and Hindi.
- Confirm order of the five sections.
- Confirm only one primary action card.
- Reload Home and confirm no follow-up-opener claim occurs (check via
  founder-visible state or logs if available).
- Enter Coach and confirm follow-up opener is claimed only now.
- Tap each of the four shortcuts; confirm navigation and pre-filled, unsent
  message text.
- Check light/dark theme, ~360px/640px/768px widths.

**Protected systems:** Follow-up opener and claim behavior; prescription
lifecycle; all global protected systems below.

---

## Stage 5 — Train redesign

**Purpose:** Redesign Train to surface the real, current practice set without
reintroducing retired concepts.

**Strict scope — visible practices:**
- Ritual
- Pressure Reset
- Reflection
- Focus Card Builder
- Quick Rep (visually secondary row)

**Rules:**
- Rename "Daily Mental Rep" to "Quick Rep" during this stage (visible copy
  only, in both languages).
- A short, intentional scroll is acceptable — do not force everything above
  the fold.
- Do not reintroduce Playbook, games, skill paths, Practice Focus, or Next
  Play Reset on this screen.

**Exclusions:** No changes to the practices' internal flows (that is Stages
6–8). This stage only changes the Train listing screen.

**Dependencies:** Stage 4 merged to `main`.

**Likely files:** `client/src/pages/TrainPage.jsx` (or equivalent),
`client/src/i18n/translations.js`.

**Functional acceptance criteria:**
- Train lists exactly the five practices above, in the specified visual
  hierarchy (Quick Rep visually secondary).
- No retired concepts (Playbook, games, skill paths, Practice Focus, Next
  Play Reset) appear on Train.
- "Daily Mental Rep" string no longer appears anywhere visible; "Quick Rep"
  is used instead.

**English and Hindi requirements:**
- "Quick Rep" and any other new copy present in both `en` and `hi`.
- Confirm no leftover "Daily Mental Rep" string in either language file.

**Focused test expectations:**
- Existing Train tests updated for the new label and layout, passing.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Train in Vercel preview, English and Hindi.
- Confirm the five practices appear, Quick Rep visually secondary.
- Confirm no retired concepts appear.
- Confirm scrolling behavior is intentional, not broken.
- Check light/dark theme, ~360px/640px/768px widths.

**Protected systems:** All global protected systems below.

---

## Stage 6 — Shared practice shell

**Purpose:** Build the smallest shared Intro → Practice → Completion
structure, proven on one real practice before any migration.

**Strict scope:**
- Exactly one shared shell: Intro → Practice → Completion.
- Prove it first on Quick Rep only.
- Exactly one introduction screen/step.
- Exactly one primary Start action.
- Optional "Why this works" disclosure (collapsible, not forced reading).
- Consistent completion behavior and consistent return-destination behavior
  (where the athlete lands after completing).
- Preserve Quick Rep's existing data, saving, and completion semantics
  exactly — only the shell around it changes.

**Exclusions:**
- Do not build speculative abstractions for practices not yet migrated
  (Pressure Reset, Reflection stay untouched this stage).
- No backend/API changes.

**Dependencies:** Stage 5 merged to `main`.

**Likely files:** New shared shell component(s) under
`client/src/components/` (e.g. a `PracticeShell`), Quick Rep's page file
updated to use it.

**Functional acceptance criteria:**
- Quick Rep runs entirely through the new shared shell.
- Quick Rep's saved data and completion side effects are unchanged (verify
  against pre-migration behavior).
- The shell exposes exactly one Start action and exactly one intro step.

**English and Hindi requirements:**
- Shell copy ("Why this works" label, Start button, etc.) present in both
  `en` and `hi`.

**Focused test expectations:**
- Quick Rep tests updated to exercise the new shell and pass.
- Any shell-level unit tests (if added) pass.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Quick Rep in Vercel preview, English and Hindi.
- Confirm intro → practice → completion flow feels identical in substance to
  before, just restyled.
- Confirm completion/save behavior unchanged (e.g. XP or report still
  recorded as before, if applicable).
- Check light/dark theme, ~360px/640px/768px widths.

**Protected systems:** Existing data/saving/completion semantics for Quick
Rep; all global protected systems below.

---

## Stage 7 — Pressure Reset migration

**Purpose:** Migrate Pressure Reset onto the Stage 6 shared shell without
altering any of its safety-critical or data behavior.

**Strict scope:**
- Migrate Pressure Reset's UI to the approved shared shell.
- Collapse duplicated introductory content into the shell's single intro
  step.
- Preserve breathing timing and interaction exactly (no timing/logic
  changes).
- Preserve crisis keyword handling and `HelplineList` exactly as-is.
- Preserve `ToolReport` saving (bodyReset.js) exactly.
- Preserve `prescriptionId` and prescription-completion linkage exactly.
- Preserve Pressure Reset history (`/body-reset/history`) exactly.
- No backend changes of any kind.

**Exclusions:** No change to breathing algorithm, crisis detection logic, or
any server route.

**Dependencies:** Stage 6 merged to `main`.

**Likely files:** Pressure Reset page/flow components under
`client/src/pages/` (e.g. `BodyResetPage.jsx` and its steps).

**Functional acceptance criteria:**
- Pressure Reset runs through the shared shell end to end.
- Breathing timing is measured/verified unchanged.
- Crisis keyword path still surfaces `HelplineList` correctly.
- Completing a session still creates the same `ToolReport` and still
  completes the linked prescription when one exists.
- History view still lists past sessions correctly.

**English and Hindi requirements:**
- No copy meaning changes beyond what the shell requires; if any copy moves,
  both `en` and `hi` are updated together.

**Focused test expectations:**
- Pressure Reset tests covering crisis path, report saving, and prescription
  completion all still pass.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Pressure Reset in Vercel preview, English and Hindi.
- Run a full session; confirm breathing timing feels identical to production.
- Trigger the crisis keyword path deliberately; confirm `HelplineList` and
  iCall/KIRAN numbers still appear.
- Confirm a linked prescription is marked complete after finishing the
  session (if applicable to the test account).
- Confirm history still shows past sessions.
- Check light/dark theme, ~360px/640px/768px widths.

**Protected systems:** Crisis/safety keyword handling; `HelplineList`;
`ToolReport` saving; prescription lifecycle; all global protected systems
below.

---

## Stage 8 — Reflection migration

**Purpose:** Migrate Reflection (renamed visibly from Debrief/After the
Match where applicable) onto the shared shell while preserving all
submission, AI, and safety logic.

**Strict scope:**
- Rename visible product language to "Reflection" — retain internal routes
  and API names (e.g. `debrief`) where changing them would be unsafe or
  unnecessary churn.
- Migrate Reflection's UI to the shared shell.
- Preserve reflection submission logic exactly.
- Preserve AI insight (`arjunInsight`) generation and display behavior
  exactly.
- Preserve self-abuse/safety handling exactly.
- Preserve prescription-completion linkage exactly.
- Verify keyboard behavior on small mobile screens (input focus, viewport
  resize, no obscured submit button).

**Exclusions:** No renaming of internal routes/API/model names unless doing
so is demonstrably safe and trivial; default to leaving them alone.

**Dependencies:** Stage 7 merged to `main`.

**Likely files:** Reflection/Debrief page and step components under
`client/src/pages/`.

**Functional acceptance criteria:**
- Reflection runs through the shared shell end to end.
- Submission still creates a `Debrief` record with the same fields.
- AI insight still generates and displays correctly.
- Safety/self-abuse handling still triggers correctly.
- Linked prescriptions still complete correctly.
- On a small mobile viewport, the keyboard does not obscure required
  controls.

**English and Hindi requirements:**
- "Reflection" and all related copy present in both `en` and `hi`.
- Confirm no leftover old visible naming in either language file.

**Focused test expectations:**
- Reflection tests covering submission, AI insight, safety handling, and
  prescription completion all still pass.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Reflection in Vercel preview, English and Hindi.
- Submit a reflection; confirm AI insight appears as before.
- Deliberately enter concerning text; confirm safety handling still
  triggers.
- Confirm a linked prescription completes correctly.
- Test on a small mobile viewport (~360px) with the keyboard open; confirm
  submit control remains reachable.
- Check light/dark theme, ~640px/768px widths.

**Protected systems:** Safety/self-abuse handling; AI insight behavior;
prescription lifecycle; all global protected systems below.

---

## Stage 9 — Playbook and Mind Journal consistency

**Purpose:** Align Playbook and Mind Journal visually and structurally
without changing their data contracts or privacy model.

**Strict scope:**
- Move "What I'm learning" to the top of Playbook.
- Add a quiet Mind Journal entry point inside Playbook.
- Align headers, empty states, spacing, and token usage with the Stage 3
  foundation.
- Preserve Mind Journal privacy and context opt-in exactly.
- No scores, diagnosis, profiling, or automatic prescriptions introduced.
- Keep athlete-written journal text untranslated (never machine-translated
  or altered).

**Exclusions:** No change to Mind Journal's API contract or Playbook's API
contract.

**Dependencies:** Stage 8 merged to `main`.

**Likely files:** Playbook and Mind Journal page/components under
`client/src/pages/`.

**Functional acceptance criteria:**
- Playbook shows "What I'm learning" first.
- A Mind Journal entry point is present inside Playbook, styled quietly
  (not competing with primary content).
- Mind Journal's privacy/opt-in behavior is unchanged.
- No score, diagnosis, or auto-prescription UI appears in either surface.
- Athlete-authored journal text is rendered verbatim, never translated.

**English and Hindi requirements:**
- All UI chrome (headers, empty states, labels) present in both `en` and
  `hi`. Athlete-authored content is explicitly exempt from translation.

**Focused test expectations:**
- Playbook and Mind Journal tests covering ordering, entry point, and
  privacy/opt-in behavior pass.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Open Playbook in Vercel preview, English and Hindi.
- Confirm "What I'm learning" appears first.
- Confirm the Mind Journal entry point is present and quiet in tone.
- Confirm privacy/context opt-in still behaves as before.
- Confirm no scores/diagnosis/auto-prescription copy anywhere.
- Check light/dark theme, ~360px/640px/768px widths.

**Protected systems:** Mind Journal API contract; Playbook API contract;
Mind Journal privacy/opt-in model; all global protected systems below.

---

## Stage 10 — Final consistency and accessibility QA

**Purpose:** Final pass to align remaining surfaces, verify accessibility
basics, and remove dead visible copy/imports left over from the migrations —
without any backend data cleanup.

**Strict scope:**
- Align Coach cards and chips with approved tokens.
- Align Ritual and Focus Card Builder presentation with the Stage 3
  foundation.
- Audit English and Hindi at approximately 360px, 640px, and 768px.
- Verify bottom-navigation behavior across all library pages.
- Verify minimum type size and touch-target sizes.
- Verify light and dark themes across all touched surfaces.
- Remove dead visible copy and imports created by completed migrations
  (Stages 3–9) only.

**Exclusions:**
- Do not perform backend legacy-data deletion of any kind.
- Do not touch any surface not already touched by Stages 3–9.

**Dependencies:** Stage 9 merged to `main`.

**Likely files:** Coach chat UI components, Ritual page, Focus Card Builder
page, and any files with now-dead imports/copy from prior stage migrations.

**Functional acceptance criteria:**
- Coach cards/chips use approved tokens consistently.
- Ritual and Focus Card Builder presentation matches the Stage 3 foundation.
- All audited breakpoints render without overflow, clipping, or unreadable
  text in both languages.
- Bottom navigation works correctly from every library page.
- Type sizes and touch targets meet a reasonable minimum (no regressions
  introduced by the migrations).
- Light and dark themes both render correctly on every touched surface.
- No dead imports or dead visible strings remain from Stages 3–9.

**English and Hindi requirements:**
- Full pass across `en` and `hi` for every surface touched in Stages 3–9;
  no missing keys, no leftover retired strings.

**Focused test expectations:**
- Any tests touching the cleaned-up surfaces still pass after dead-code
  removal.

**Full client test and production-build requirements:**
- `cd client && npm test` passes.
- `cd client && npm run build` passes with zero errors.

**Stage-specific founder preview checks:**
- Walk every surface touched by Stages 3–9 in the Vercel preview, English
  and Hindi, at ~360px/640px/768px, light and dark theme.
- Confirm bottom navigation works from each library page.
- Confirm no visibly broken layout, clipped text, or unreadable contrast.
- Re-run the safety check from Stage 7 (Pressure Reset crisis path) and the
  prescription check from Stage 7/8 as a final regression pass, since this
  stage touches shared presentation code.

**Protected systems:** All global protected systems below, plus: no backend
legacy-data deletion.

---

## Global protected systems (every stage)

Every stage must protect, unless a future stage explicitly and separately
approves touching it:

- Server and Prisma schema (`server/`, `server/prisma/schema.prisma`)
- Authentication (`authenticate` middleware, JWT/bcrypt flows)
- Guardian consent
- Payments (Razorpay checkout, webhook, subscription logic)
- Shared safety screening
- `SafetyEvent`
- Founder dashboard
- `buildSystemPrompt()` (chat.js)
- Main coaching tool loop
- Structured quick replies
- Prescription lifecycle
- Follow-up opener and claim behavior
- Mind Journal API contract
- Playbook API contract
- Historical Mental Fitness data
- Generic `CheckIn` data

## Global prohibitions (every stage)

- No automatic merging.
- No auto-merge enabled on any PR.
- No direct production-deployment actions.
- No SQL run directly against any database.
- No secrets or environment-variable changes.
- No unrelated features bundled into a stage PR.
- No stacking work on top of an unmerged stage PR — the next stage does not
  begin until the current stage's PR is merged into `main`.
