# Hook Model audit — every part of Arjun (Nov 2026)

Rule (founder, 22 Nov 2026): every feature follows **Trigger → Action → Variable reward → Investment → next trigger** (Nir Eyal, *Hooked*). Guard rails: no streaks or streak shame, no rankings against others, no fake urgency, honest copy, reminders the athlete controls. Users are 14–25 (many under 18): hooks build a **training habit**, not screen time.

Legend: ✅ already there · 🟡 partly · ❌ missing → proposal.

| Surface | Trigger | Action | Variable reward | Investment | Biggest gap → proposal |
|---|---|---|---|---|---|
| **Mind Challenge** (new) | ✅ Home card "New" / "Rematch ready" | ✅ one tap, 6 short rounds | ✅ skill reveal each round, card at the end, share | ✅ pick skill + next match → path reorders | Rematch **reminder** (push) 28 days later — needs a push message type |
| **Your path** (Profile) | 🟡 only when they open Profile | ✅ one Next button | 🟡 ticks, chapter unlock | ✅ steps done, play outcome | Show the **Next step** on Home too (one line under "This week"), and a "Chapter unlocked!" moment when a chapter finishes |
| **Arjun chat** | 🟡 Home "Talk to Arjun", shortcuts | ✅ shortcuts send straight away | ✅ a personal reply every time (naturally variable) | ✅ memory, practices, outcomes | **Pre-match trigger**: the "next match" answer from the Mind Challenge → Arjun checks in the day before ("Ready for tomorrow? 2-min reset?"). Arjun should also know the current chapter (path step 4) |
| **Pressure Reset** | 🟡 from Train / Arjun's practice card | ✅ 2–3 min, guided | ✅ stadium celebration, tension before → after | 🟡 saved session | After "done": ask **"Use it in your next match?"** → ticks the path's Play step later |
| **Quick Rep** | 🟡 Train / Arjun | ✅ short | ✅ celebration + your cue | ✅ cue saved | Same "use it in play" hand-off; show the cue on Home before match days |
| **Focus Cards** | ❌ only from Train | 🟡 builder takes a few steps | 🟡 card saved | ✅ cards kept (max 5) | **"Card of the day"** on Home before a match (their own words come back = investment returns) |
| **Ritual** | ❌ only from Train | ✅ rehearsal one step per screen | 🟡 cheer at the end | ✅ routines kept (max 5) | Pre-match nudge "Run your routine" when a match is near |
| **Mind Journal** | 🟡 Home row | ✅ quick note or 2-min reflection | ✅ Arjun's review (variable, personal) | ✅ entries + takeaways | After a match day → "How did it go?" trigger; show a past takeaway back now and then ("You wrote: start slower in warm-up") |
| **Home** | ✅ day greeting | ✅ one big Talk to Arjun | 🟡 This week counts | — | One **"Your next step"** line (from the path) so every visit has a clear action |
| **Weekly reviews** | 🟡 Coach header link | ✅ just read | ✅ new every week, personal | — | Push / Home card "Your week with Arjun is ready" on review day |
| **Website** | ✅ ads/search → hero | ✅ Start free | 🟡 real app screens | — | After sign-up, go straight into the **Mind Challenge** as the first experience (reward in the first 5 minutes) |

## Proposed order (each a small PR, mock-ups first)
1. ✅ **Home "Your next step" card** from the path + "Chapter unlocked!" moment — built (Nov 2026).
2. ✅ **Arjun knows the path + next match** — built (Nov 2026): match day picker, day-before prep card, "How did it go?" (ticks Play), chapter-aware Coach note. Also: the path's Reflect step is now one screen that knows the chapter.
3. ✅ **"Use it in play" hand-off** — built (Nov 2026): an if–then play plan at the end of Pressure Reset / Quick Rep / Ritual; it comes back on Train, before the match and in "How did it go?" (ticks Play).
4. ✅ **Reminders** — built (Nov 2026): the one daily reminder becomes specific (match tomorrow · how did it go · rematch ready · weekly review), each kind with its own switch in Settings.
5. ✅ **First-run** — built (Nov 2026): onboarding cut to 4 screens, then next match → the Mind Challenge as the first reward (`/welcome`).
6. ✅ **Investment comes back** — built (Nov 2026): "Your words" on Home — one of their own Focus Card words, cues, journal take-forward lines or practice lessons, rotating daily.
