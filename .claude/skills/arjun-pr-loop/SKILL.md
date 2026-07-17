---
name: arjun-pr-loop
description: Deterministic, one-stage-at-a-time PR loop for implementing Arjun pilot Stages 3–10. Use when a routine run is asked to advance the Arjun pilot roadmap, check on its status, or resume interrupted stage work. Never merges, never enables auto-merge, never starts a stage before the previous one is merged to main.
---

# Arjun PR Loop

This skill drives the Arjun Pilot PR Loop: a repository-based automation that
implements `docs/arjun-pilot-pr-roadmap.md` Stages 3–10, one stage per run,
one branch per stage, one draft PR per stage, always stopping for founder
preview and manual merge.

Read together with:

- `docs/arjun-pilot-pr-roadmap.md` — what each stage is
- `.claude/arjun-loop-state.json` — current stage state
- `CLAUDE.md` — repository conventions and protected systems

This skill is self-contained. Do not assume prior conversation context — a
routine invocation may start cold.

## Operating order (every run, no exceptions)

1. **Fetch the latest origin state.** `git fetch origin --prune`.
2. **Read the state file and roadmap.** Load
   `.claude/arjun-loop-state.json` and `docs/arjun-pilot-pr-roadmap.md` fresh
   from `origin/main` (not from a stale local checkout).
3. **Confirm the working tree is clean.** `git status --porcelain` must be
   empty before doing anything else. If not, stop and report — do not stash
   or discard without founder approval.
4. **Check GitHub for an existing open Arjun Pilot Loop PR** (title prefix
   `[Arjun Pilot Loop]`, or check `activePullRequest` in the state file).
5. **Check for an unfinished branch for `nextStage`** (expected branch name
   from the state file, e.g. `claude/arjun-pilot-stage-3`).
6. **Decide: stop, resume, or start** — using the gates below.

## Open-PR gate

If an open `[Arjun Pilot Loop]` PR already exists:

- Do **not** create another branch.
- Do **not** begin another stage.
- Inspect its CI status, diff, and the state file's `activePullRequest`.
- Report whether it is:
  - **incomplete** — implementation or validation still in progress;
  - **blocked** — CI failing, or a protected system was touched
    unexpectedly;
  - **ready for founder preview** — all checks passed, draft PR posted with
    its founder preview checklist.
- Stop. Do not take further action this run.

## Resume gate

If no open loop PR exists, but the expected branch for `nextStage` exists
(locally or on origin) with prior commits:

- Check out that branch (do not create a new one).
- Inspect its commit history for the last checkpoint (see "Quota and
  interruption recovery" below).
- Resume implementation from that checkpoint rather than restarting.
- Never `reset --hard` or force-push over existing checkpoint commits unless
  the founder explicitly approves discarding them.

## New-stage flow

Only when neither an open loop PR nor an unfinished stage branch exists:

1. Identify `nextStage` from the state file on latest `origin/main`.
2. Read that stage's section in `docs/arjun-pilot-pr-roadmap.md`. Inspect
   only files relevant to that stage's scope.
3. Create one clean branch from latest `origin/main`, named exactly as
   recorded in the state file (`claude/arjun-pilot-stage-<n>`).
4. Push the new branch early (before substantial editing), so work is
   recoverable if interrupted.
5. Implement only that stage — nothing from any other stage.
6. Run the stage's focused tests.
7. Run the full client test suite (`cd client && npm test`, if present).
8. Run the production client build (`cd client && npm run build`) — must be
   zero errors.
9. Inspect the diff for protected-system files (see roadmap's Global
   Protected Systems section and `CLAUDE.md` §15). If any protected file was
   touched without explicit stage justification, stop and report instead of
   opening a PR.
10. Update `.claude/arjun-loop-state.json` correctly (see rules below).
11. Open exactly one draft PR, titled and bodied per the roadmap's PR naming
    and founder-review-gate requirements.
12. Stop. Do not begin the next stage in this run, even if time/quota
    remains.

## State file update rules

- Only the routine run implementing a stage may set that stage's status to
  `ready_for_founder_review`, and only once implementation and all
  validation (focused tests, full test suite, production build, protected-
  file diff check) are actually complete.
- When setting `ready_for_founder_review`, record the branch name and draft
  PR number/URL in that stage's entry and in `activePullRequest`. Do **not**
  add the stage to `completedStages` yet. Do **not** advance `nextStage` yet.
- A later run only marks a stage `completed` — adding it to
  `completedStages`, advancing `nextStage` to the following stage number,
  and clearing `activeStageBranch` / `activePullRequest` — after confirming
  that stage's branch is actually merged into `origin/main` (e.g. its
  commits are reachable from `origin/main`, or the PR shows as merged).
- Never mark a future stage completed before its PR is merged into `main`.
- Stage 10's completion sets `nextStage` to `null`.

## Quota and interruption recovery

Assume Claude usage quota, timeout, or cloud-session interruption may occur
during any stage.

1. Push the stage branch before substantial editing.
2. Commit and push recoverable checkpoints after meaningful completed
   sections (e.g. "primitives done, reference surface not yet wired").
3. Incomplete checkpoint commit messages must clearly say the stage remains
   incomplete (e.g. `wip(stage-3): tokens added, reference surface pending —
   NOT READY FOR FOUNDER REVIEW`).
4. Never advance stage state in `.claude/arjun-loop-state.json` because of a
   checkpoint — only a fully validated, PR-opened stage may be marked
   `ready_for_founder_review`.
5. Never open a PR described as ready while implementation or validation is
   incomplete.
6. If interrupted mid-stage:
   - Preserve and push recoverable work to the stage branch.
   - Leave `main` untouched.
   - Record the last completed checkpoint in the branch's commit history.
   - Report exact remaining work.
   - Do not begin the next stage.
7. At the start of every later run, look for the expected branch for
   `nextStage` first; inspect its commits and status; resume it rather than
   creating a duplicate branch.
8. Never discard unfinished work using `reset --hard` or force-push unless
   the founder explicitly approves recovery.
9. Never weaken roadmap requirements merely to finish before quota expires.

If work is incomplete at the end of a run, report exactly:

```
NOT READY FOR FOUNDER REVIEW
```

followed by a list of the remaining tasks or blockers.

## Founder review gate

A completed stage PR must remain a **draft** PR. The routine must never:

- merge the PR;
- mark it ready-for-review and merge it;
- enable auto-merge;
- trigger any production deployment directly;
- start the next stage before the current stage's commits appear on
  `origin/main`.

Every completed draft PR must include a section titled exactly:

```
Founder preview checks before merge
```

The checklist must be specific to the stage (pull the relevant items from
that stage's "stage-specific founder preview checks" in the roadmap) and
include, where relevant:

- how to open the Vercel PR preview;
- exact routes and screens to visit;
- exact buttons and interactions to try;
- expected results;
- English checks;
- Hindi checks;
- ~360px mobile checks;
- ~640px and ~768px checks;
- light and dark theme checks;
- safety checks, when safety-sensitive screens were touched;
- prescription and follow-up regression checks, when those surfaces were
  touched.

The final PR report must say exactly:

```
READY FOR FOUNDER PREVIEW — DO NOT MERGE UNTIL MANUAL CHECKS PASS
```

Automated tests alone are never sufficient approval.

## PR naming

Stable title prefix: `[Arjun Pilot Loop]`

| Stage | Title |
|---|---|
| 3 | `[Arjun Pilot Loop] Stage 3 — Minimal UI foundation` |
| 4 | `[Arjun Pilot Loop] Stage 4 — Home redesign` |
| 5 | `[Arjun Pilot Loop] Stage 5 — Train redesign` |
| 6 | `[Arjun Pilot Loop] Stage 6 — Shared practice shell` |
| 7 | `[Arjun Pilot Loop] Stage 7 — Pressure Reset migration` |
| 8 | `[Arjun Pilot Loop] Stage 8 — Reflection migration` |
| 9 | `[Arjun Pilot Loop] Stage 9 — Playbook and Mind Journal consistency` |
| 10 | `[Arjun Pilot Loop] Stage 10 — Final consistency and accessibility QA` |

Stable branch name prefix: `claude/arjun-pilot-stage-` (e.g.
`claude/arjun-pilot-stage-3`).

## Readiness report

When a stage is ready, report:

1. Stage number and title.
2. PR number and link.
3. Concise product changes.
4. Exact files changed.
5. Focused test result.
6. Full client test result.
7. Production build result.
8. Protected-system diff confirmation (explicitly state nothing protected
   was touched, or explain any approved exception).
9. Quota interruptions and checkpoint history, if any.
10. Exact founder preview checklist (as posted in the PR).
11. Explicit confirmation that the following stage has not started.

## Global rules (every run)

- Implement only one stage per run.
- Create one separate branch per stage.
- Run focused tests, the full client test suite, and the production build
  before opening any PR.
- Open exactly one draft PR per stage.
- Stop for founder preview and manual merge — never merge, never enable
  auto-merge.
- Never begin the following stage until the current stage is merged into
  `main`.
- Protect every system listed in the roadmap's Global Protected Systems
  section and in `CLAUDE.md` §15, at all times.
- No SQL, no secrets/environment changes, no unrelated features, no stacking
  work on an unmerged stage PR.
