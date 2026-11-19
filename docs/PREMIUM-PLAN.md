# Arjun — Premium Look Plan

**Goal:** Arjun should look like a premium, carefully crafted app (reference: athletemindset.app), not a "vibe-coded" one.
**Rule:** we keep the current layout, colours and features. We add a premium layer on top: real app screens, depth, soft backgrounds, a mascot and smooth motion.
**How we work:** one step at a time, in order. Each step = mock-up or proof first → founder says go → build → PR → founder merges → tick the box here. Nothing outside this list gets done until the list is finished (new ideas go to "Parking lot" at the bottom).

Owner key: **Claude** = done in code by Claude. **Founder** = done by you (things Claude can't make).

---

## Where we are now

> **Current step:** Founder reviews the premium mock-ups (3D Teer + backgrounds) on the "Arjun mascot" canvas. Then Claude builds Step 2 + places mascot/backgrounds. Waiting on: founder's videos (for Step 6).
> Last updated: 19 Nov 2026

---

## Step 0 — Close what is open (Claude + Founder)

- [x] Founder: merge PR #140 (see-through "Say hi" pill + app drawing in the final section)

## Step 1 — Decisions (Founder)

Answer these three, in one message. Claude will not start Step 2 without them.

- [ ] **Videos:** send the screen recordings of the reference animations. *(still to come — needed before Step 6)*
- [x] **Mascot route:** decided 17 Nov — **try C first** (Claude's 2D mascot), and Claude gives AI-tool prompts so the founder can also try B.
  - A. Illustrator / 3D artist (Fiverr or Upwork) — best quality, ~1–2 weeks, ~₹5,000–25,000
  - B. AI image tool (Midjourney, ChatGPT image) — fast, you pick the best result
  - C. Claude draws a flat 2D mascot in code — free, today, but not 3D quality
- [x] **Gradients:** decided 17 Nov — **website + app**. (This replaces the old "no gradients" rule in CLAUDE.md §7 once Step 2 ships.)

## Step 2 — Premium foundations (Claude)

Mock-ups first, then build.

- [ ] Premium style tokens: soft "sky" gradient backgrounds, glow, frosted glass, layered shadows, smoother corners.
- [ ] A premium phone frame (thin bezel, real reflections, soft shadow, slight depth).
- [ ] Type check: test a premium display font for big headings only (body stays Sora). Founder approves or rejects.
- [ ] Founder approves the mock-up.

## Step 3 — Real app screens instead of drawings (Claude)

The single biggest upgrade.

- [ ] A script in the repo that opens the real app with demo data and saves clean screenshots (Home, Coach chat, Pressure Reset, Focus Card, My practice) in light and dark.
- [ ] Put the real screenshots in the website phones (hero + How Arjun helps). Remove the hand-drawn phone screens.
- [ ] Re-run the script whenever the app changes, so the website never shows an old screen.

## Step 4 — Mascot (Founder makes it, Claude places it)

- [x] **4a (Claude, first):** flat 2D mascot drawn — Concept A (young athlete) and Concept B ("Teer", round arrow buddy), 6 poses each, on the "Arjun mascot" design canvas. Prompts for AI tools live in `docs/MASCOT-PROMPTS.md`.
- [x] **4b (Founder):** picked B ("Teer"). 3D version made with an AI tool (19 Nov): 8 poses. Cut-outs in `docs/assets/premium/teer-*.png`.
- [ ] Founder: send each pose as its own **bigger** image (at least 1000 px tall). The sheet gives ~360 px per pose — fine for small use, a bit soft on big screens.
- [ ] Claude: 2D animated moods (big smile, confused, caring, etc.) are on the canvas — redo them in 3D style later if wanted.

- [ ] Founder: get the mascot made using the brief below (route A or B), or Claude draws it (route C).
- [ ] Founder: send the files.
- [ ] Claude: place it on the website hero, launch screen, empty screens (no chats yet, no journal yet), and the "Say hi to Arjun" button.

**Mascot brief (copy-paste this to the artist or AI tool):**
- An **original** friendly character for "Arjun", an AI mental coach for young Indian athletes (14–25). Arjun is named after the great archer from the Mahabharata — calm, focused, never misses.
- Ideas: a young athlete character with a sweatband and a small bow, or a cute round character holding an arrow. Must feel warm, calm and confident — a coach, not a cartoon clown.
- Style: soft 3D, clay-like, gentle lighting, premium (like modern app mascots). **Must NOT look like Athlete Mindset's "Aomi" (the brain character) or any other brand's mascot.**
- Colours: brand blue `#1B4DFF`, sun yellow `#FFC629`, mint `#7FE3C4`, coral `#FF6B4A`, dark ink `#101533`.
- Poses (6): waving hello · listening/thinking · breathing calmly (eyes closed) · pointing to something · celebrating · holding a clipboard/notes.
- Files: PNG with **transparent background**, at least **2000 × 2000 px** each. Also one plain front-facing head for small icons.
- Rights: you must own full commercial rights (written in the contract or tool's terms).

## Step 5 — Backgrounds (Founder supplies, Claude places)

- [x] Founder: 4 scenes received 19 Nov (track sunrise, indoor court, lake, stadium at dusk) → `docs/assets/premium/bg-*.jpg`. They are 1672 px wide (brief said 2400) — fine for phones; for big laptop screens a bigger copy would be sharper.
- [ ] ~~Founder: get 3–4 soft, misty scene images (AI tool or stock you have rights to). Ideas: empty running track at sunrise · calm lake with mountains · indoor court in soft light · stadium lights at dusk. Landscape, at least **2400 px wide**, no people's faces, no logos, no text.~~
- [ ] Claude: fade them behind the website sections, keep text readable, compress them so the page stays fast.

## Step 6 — Motion (Claude)

- [ ] Match the animations in the founder's videos: phone screen changes, voice/breathing wave, floating mascot, gentle scroll-in effects.
- [ ] Respect "reduce motion" phone settings. Keep it smooth on cheap Android phones.

## Step 7 — Bring the premium layer into the app (Claude)

Only the parts the founder chose in Step 1.

- [ ] Launch screen with the mascot.
- [ ] Mascot on empty screens and in Coach.
- [ ] (If chosen) soft gradient headers on Home and practice intros.

## Step 8 — Final check (Claude + Founder)

- [ ] Claude: test on small phone, normal phone, big phone, tablet, laptop; light and dark; page speed.
- [ ] Founder: check on your own phone and say done.

---

## Parking lot (not part of this plan — do not start until the plan is finished)

- Razorpay: create the ₹500/month and ₹2,500/year plans and send the plan IDs → then Claude updates the in-app checkout page and the prices on the Refund page.
- Founder: confirm the Refund page's new "In short" box.
- Future add-ons (see `docs/ROADMAP.md`): human sport psychologist sessions, coach portal, mental tests.
