# Arjun — content review pack

Generated 2026-11-25 from the app's own text (`node client/scripts/review-pack.mjs`). Paste the prompt below into an AI research tool with deep research / web search switched on, and attach or paste this whole file after it.

## The prompt

```text
You are a reviewer with expertise in applied sport psychology, youth athlete development and psychological measurement (psychometrics). I am a sport psychologist and the founder of "Arjun", a mobile app that coaches the mental side of sport for young Indian athletes aged 14–25 (cricket, football, badminton, athletics, wrestling, boxing, kabaddi, tennis, hockey, swimming). It is performance coaching, NOT therapy or diagnosis. Screens are in simple English for readers whose first language may not be English.

Below is ALL the content athletes see: (1) a 6-chapter training plan, each chapter with 3 levels of 2-minute lessons; (2) the "Mind Challenge", a short self-check that gives a Level 1–5 per skill; (3) two skill lessons with quick-check quizzes per sport; (4) tool intros and sport examples; (5) onboarding questions.

Use deep research and peer-reviewed literature to review it. For every item give a verdict: KEEP, EDIT or REMOVE.

PART A — Lessons (training plan + skill lessons)
For each lesson check:
1. Evidence: which established technique it teaches (e.g. arousal regulation / paced breathing, attentional cues, instructional vs motivational self-talk, pre-performance routines, refocusing after errors, imagery / PETTLEP), and whether the claim is supported. Cite the best evidence.
2. Accuracy: anything wrong, overstated or oversimplified to the point of being misleading?
3. Safety and scope: suitable for 14-year-olds? Any wording that sounds clinical, promises results, or could harm (e.g. ignoring pain or injury)?
4. Progression: is Level 2 really a step up from Level 1, and Level 3 from Level 2?
5. Clarity: reading level (aim: age 12 / CEFR B1), jargon, one idea per card.
6. Cultural fit for Indian athletes (family and coach pressure, selection trials).
7. Quizzes: is the "correct" answer clearly right, are the wrong options plausible but clearly worse, any trick or leading questions?

PART B — Mind Challenge (the self-check)
1. For each skill, name the construct it seems to measure and the closest validated instruments (e.g. ACSI-28, TOPS/TOPS-2, SAS-2, CSAI-2R, Sport Imagery Questionnaire, MTQ48 / SMTQ, Self-Talk Questionnaire). Say how well the items match that construct. Do NOT copy items from copyrighted scales.
2. Item quality: double-barrelled, leading, socially desirable, ambiguous time frame, answer options that are not ordered or not equally spaced, items that measure behaviour vs feeling inconsistently.
3. Scoring: 2 items × 0–3 points per skill → Level 1–5 (rules below). Is this defensible? Risks of only 2 items per skill (reliability), of using a 15-second tapping game as a "focus" score, and of averaging into one "Mind Level".
4. Framing: is it honestly presented as a self-check, not a test or diagnosis? Any risk of labelling young athletes?
5. Give a practical validation plan for a small startup: cognitive interviews, pilot sample sizes, item analysis (floor/ceiling, item–total correlation), internal consistency, test–retest at ~2–4 weeks, convergent validity against a free validated scale.

PART C — Onboarding questions
Check that each question and its answer options are clear, not leading, cover the realistic answers, and are appropriate for teenagers.

RULES
- Cite only sources you actually found. For each citation give authors, year, title, journal and DOI or link. If you cannot find support, write "No source found" — never invent a reference.
- Separate "strong evidence", "some evidence" and "expert opinion".
- Keep suggested rewrites in very simple English, same length or shorter than the original, and keep any {placeholders} as they are.
- Do not add clinical advice. Flag anything that should send an athlete to a professional.

OUTPUT
1. A 10-line summary of the biggest issues, most important first.
2. Table A (lessons): Item ID | Verdict | Problem | Evidence (citation) | Suggested rewrite.
3. Table B (Mind Challenge items and scoring): same columns, plus "Construct" and "Closest validated scale".
4. Table C (onboarding): Item ID | Verdict | Problem | Suggested rewrite.
5. A step-by-step validation plan for the Mind Challenge (Part B.5).
6. Reference list.
```

**Notes for you (not for the AI):** AI research tools can invent references. Open every source before you rely on it. A review like this checks the *content*; it cannot prove the Mind Challenge measures what it says — that needs real answers from athletes (step 5 of the plan).

**Placeholders:** lessons use `{focusWord}`, `{resetWord}` and `{unit}`. The app fills them from the athlete's sport — for cricket: focus word "Watch the ball", reset word "Next ball", unit "ball"; for tennis: "Watch the ball", "Next point", "point". Section 4 lists every sport.

---

## 1. Training plan — 6 chapters × 3 levels

Each level = the same 4 steps: **Learn** (2-minute lesson) → **Try it** (practise in the app) → **Use it** (in training or a match) → **Look back** (one line in the Mind Journal). Level 1 Basics · Level 2 In the match · Level 3 Big pressure. The first chapter is chosen from what the athlete says is hardest; the next chapter opens after Level 1.

### Chapter 1 — Calm body (`calm`)
_Settle your nerves before you play_

**L-calm-1 · Level 1 (Basics) — "Why your hands shake before a big moment"**
1. Before a big moment your heart races and your hands shake. That is your body getting ready to play — not a sign you will fail.
2. A long, slow breath out tells your body it is safe. Breathe in for 4, out for 6.
3. Practise it when you are calm, so it works when you are nervous.
- Takeaway: Long breath out = calm body.
- Try it: Do a Pressure Reset
- Use it: Use the slow breath out before your next match or training

**L-calm-2 · Level 2 (In the match) — "Calm between moments"**
1. In a match there is no time for 3 minutes of breathing. You need a fast version.
2. Between each {unit}, take one long breath out — longer than the breath in. That is enough to settle your body.
3. Practise it in training first, so your body knows it when the match starts.
- Takeaway: One long breath out between every {unit}.
- Try it: Do a Pressure Reset, then try one fast breath out
- Use it: Use one long breath out between moments in a match

**L-calm-3 · Level 3 (Big pressure) — "When your heart is racing"**
1. In the biggest moments — a final, a trial — your heart races faster than ever. That is normal.
2. Name it: "This is my body getting ready." Then two long breaths out and drop your shoulders.
3. Say "{focusWord}" and go. You do not need to feel calm to play well — just steady.
- Takeaway: Name it, breathe out twice, go.
- Try it: Do a Pressure Reset picturing your biggest match
- Use it: Use it in your biggest moment: a final, a trial or a tight finish

### Chapter 2 — Focus (`focus`)
_Get back to the next moment, fast_

**L-focus-1 · Level 1 (Basics) — "Why your mind replays mistakes"**
1. After a mistake your mind keeps replaying it. That is normal — your brain is trying to protect you.
2. But you can only play what is in front of you. Top players say one short word to themselves to come back to now.
3. Pick one word, like "{resetWord}" or "{focusWord}", and say it the same way every time.
- Takeaway: One short word brings you back to now.
- Try it: Do a Mind Warm-up and pick your focus word
- Use it: Say your focus word after every miss in your next match

**L-focus-2 · Level 2 (In the match) — "Your eyes lead your focus"**
1. Where your eyes go, your mind follows.
2. Before each {unit}, look at one small spot. The same spot every time.
3. If your eyes drift to the crowd or the coach, bring them back to your spot and say "{focusWord}".
- Takeaway: One spot. Every {unit}.
- Try it: Do a Mind Warm-up and pick your focus spot
- Use it: Use your focus spot in a match

**L-focus-3 · Level 3 (Big pressure) — "Focus when people are watching"**
1. Selectors, parents, a crowd — when people watch, your mind starts playing for them.
2. Notice it: "I am thinking about them." Then come back: one breath, your spot, "{focusWord}".
3. You cannot control who watches. You can control your next {unit}.
- Takeaway: Notice, breathe, back to your spot.
- Try it: Do a Mind Warm-up picturing people watching you
- Use it: Use it when people are watching — a trial or a big crowd

### Chapter 3 — Confidence (`confidence`)
_Talk to yourself like a teammate_

**L-confidence-1 · Level 1 (Basics) — "The voice in your head"**
1. You talk to yourself all day. In tough moments that voice can get harsh.
2. Talk to yourself like a good teammate would: short, calm and helpful.
3. Swap "Don't mess up" for "{focusWord}". Say what to do, not what to avoid.
- Takeaway: Be your own best teammate.
- Try it: Build your Self-Talk Card
- Use it: Say your Self-Talk Card words before your next big moment

**L-confidence-2 · Level 2 (In the match) — "Talk to yourself during the match"**
1. Confidence is not a feeling you wait for. It is what you say to yourself in the moment.
2. Pick one strong line from your Self-Talk Card and say it before key moments.
3. If a worried thought comes, answer it like a teammate: "Yes, that was a miss. Next {unit}."
- Takeaway: Answer the worry like a teammate.
- Try it: Practise your Self-Talk Card out loud
- Use it: Say your strong line before key moments in a match

**L-confidence-3 · Level 3 (Big pressure) — "Confidence after a bad day"**
1. After a bad match or being dropped, the voice in your head gets loud.
2. Write down 3 things you did well this month. Proof beats feelings.
3. Read your list before the next big match, then say your strong line.
- Takeaway: Proof beats feelings.
- Try it: Add proof of what you do well to your Self-Talk Card
- Use it: Read your proof list before your next big match

### Chapter 4 — Same every time (`routine`)
_A short routine before you play_

**L-routine-1 · Level 1 (Basics) — "Why pros do the same thing every time"**
1. Top athletes do the same small things before every {unit}. That is a routine.
2. A routine gives your mind a job, so there is less room for worry.
3. Keep it short — 3 steps, like breathe, get set, say your word. Practise it in training first.
- Takeaway: Same steps, every time.
- Try it: Build your routine
- Use it: Run your routine before your next match or training

**L-routine-2 · Level 2 (In the match) — "A short routine between moments"**
1. Before the match you have time. During the match you have seconds.
2. Make a 3-second version: one breath, one small action (like fixing your grip), your focus word.
3. Use it between every {unit}, good or bad.
- Takeaway: Breath, action, word — every {unit}.
- Try it: Build a short routine for between moments
- Use it: Use your short routine between every {unit} in a match

**L-routine-3 · Level 3 (Big pressure) — "Keep your routine when it gets tense"**
1. Under pressure, players rush and skip their routine — right when they need it most.
2. In big moments, slow it down on purpose. Same steps, same speed.
3. Your routine feels the same in training and in a final. That is what makes it safe.
- Takeaway: Big moment? Same routine, same speed.
- Try it: Practise your routine picturing a tense moment
- Use it: Keep your routine in the tensest moment of a match

### Chapter 5 — Bounce back (`bounce`)
_Reset fast after a mistake_

**L-bounce-1 · Level 1 (Basics) — "The 5-second reset"**
1. Everyone makes mistakes. What matters is how fast you get back.
2. Try 3 quick steps: let it go (one breath out), do one small action (like fixing your grip), then say your focus word.
3. It takes about 5 seconds. The faster you reset, the less one mistake turns into two.
- Takeaway: Breathe out, small action, focus word.
- Try it: Practise your reset
- Use it: Use your reset after the next mistake you make

**L-bounce-2 · Level 2 (In the match) — "Reset after a big mistake"**
1. Small mistakes are easy to forget. Big ones, at a key time, follow you around.
2. Do the 5-second reset, then get involved in the next {unit} straight away.
3. Do not hide after a mistake. Ask for the next chance.
- Takeaway: Reset, then get involved.
- Try it: Practise your reset with a big mistake in mind
- Use it: Reset fast after a big mistake in a match

**L-bounce-3 · Level 3 (Big pressure) — "Stop one mistake becoming two"**
1. One mistake is normal. The danger is the second one — made because you are still thinking about the first.
2. After a mistake, say "{resetWord}" and keep the next action simple and safe.
3. Simple and safe for one {unit}, then play your normal game again.
- Takeaway: After a mistake: simple and safe, then normal.
- Try it: Practise your reset with two mistakes in a row
- Use it: Stop one mistake from becoming two in a match

### Chapter 6 — Picture it (`picture`)
_See it going right before you play_

**L-picture-1 · Level 1 (Basics) — "Train your brain before you play"**
1. When you clearly imagine doing a skill, your brain practises it almost like the real thing.
2. Before you play, close your eyes for a minute. See, hear and feel yourself doing it well.
3. Picture it through your own eyes, at real speed, going right.
- Takeaway: See it, then do it.
- Try it: Picture yourself playing well (5 min)
- Use it: Picture one good moment for a minute before your next match

**L-picture-2 · Level 2 (In the match) — "Picture the hard moments"**
1. Picturing things going well is good. Picturing the hard moments is even better.
2. See a tough moment — a mistake, a loud crowd — and see yourself handling it calmly.
3. When it happens for real, your mind has already been there.
- Takeaway: See the hard moment, see yourself handle it.
- Try it: Picture a tough moment and handle it (5 min)
- Use it: Picture a hard moment the night before a match

**L-picture-3 · Level 3 (Big pressure) — "Picture it right before you play"**
1. Just before you start, take 30 seconds and close your eyes.
2. See your first {unit} going well. Feel it and hear it.
3. Open your eyes, say "{focusWord}", and go.
- Takeaway: 30 seconds. See it, feel it, go.
- Try it: Practise a 30-second picture before training
- Use it: Picture your first {unit} right before a match

---

## 2. Mind Challenge (self-check)

**Intro:** How strong is your mind game? — Answer 11 quick questions and play one short game. Just pick what is true for you — there are no right or wrong answers.

**How this helps you:**
- See what your mind already does well
- Find the one thing to work on first
- Arjun makes your training plan from it
- About 4 minutes
- No wrong answers
- Take it again in 4 weeks
- Instruction on every question: "Pick the answer that sounds most like you."

**Scoring (exactly as the app does it):**
- Each skill has 2 items, each answer worth 0–3 points → 0–6 points per skill.
- Focus has 1 question + a 15-second game: tap only blue balls among coral/yellow/green ones; game points from (hits − wrong taps): ≥8 → 3, 5–7 → 2, 2–4 → 1, <2 → 0.
- Points → Level: 0–1 → Level 1, 2 → Level 2, 3–4 → Level 3, 5 → Level 4, 6 → Level 5.
- "Mind Level" = the average of the 6 skill levels, rounded (minimum 1).
- "Your superpower" = highest skill level; "Level up first" = lowest (ties go to the earlier skill in this order: calm, focus, confidence, routine, bounce, picture).
- It can be retaken every 28 days; the card then shows then-vs-now.

**What each level is called:**
- Level 1: A great place to start. This grows fast with practice.
- Level 2: A solid base. A little practice moves this up.
- Level 3: Good. This is already helping you.
- Level 4: Strong. You use this well.
- Level 5: Elite. This is a real strength.

### Skill: Calm (`calm`) — "Staying calm when you feel nervous"
**MC-calm-1.** You have a big match tomorrow. What usually happens the night before?
- I sleep well — I am used to it — 3 pts
- I feel nervous, but it goes away — 2 pts
- I keep thinking about the match for hours — 1 pts
- I can hardly sleep — 0 pts

**MC-calm-2.** Just before the match starts, your heart beats fast. What do you usually do?
- I take a slow breath and calm down — 3 pts
- I like the feeling — it gets me ready — 2 pts
- I try to ignore it — 1 pts
- I start to panic a little — 0 pts

### Skill: Focus (`focus`) — "Keeping your mind on the next moment"
**MC-focus-1.** You just made a mistake. When the game starts again, where is your mind?
- Already on the next moment — 3 pts
- Back after a few seconds — 2 pts
- Half thinking about the mistake — 1 pts
- Still stuck on the mistake — 0 pts

**MC-focus-game.** Quick focus game: Tap only the blue balls. Don’t tap the other colours. You have 15 seconds. (Why, as shown: "This checks how well you keep your eyes on one thing when lots is going on — like watching the ball in a match.")

### Skill: Confidence (`confidence`) — "Believing in yourself under pressure"
**MC-confidence-1.** Just before an important moment in a match, what do you usually tell yourself?
- “I can do this” — 3 pts
- “Stay calm, keep it simple” — 2 pts
- “Let’s see what happens” — 1 pts
- “Don’t mess this up” — 0 pts

**MC-confidence-2.** You are not picked for the team for a match. What do you think?
- “What can I get better at?” — 3 pts
- “I’ll prove them wrong next time” — 2 pts
- “It’s not fair” — 1 pts
- “I’m not good enough” — 0 pts

### Skill: Routine (`routine`) — "Doing the same steps to get ready"
**MC-routine-1.** What do you do just before you start playing?
- The same few things every time — 3 pts
- Sometimes the same things — 2 pts
- Nothing special — I just start — 1 pts
- I rush and don’t feel ready — 0 pts

**MC-routine-2.** In the short breaks during play, what do you do?
- The same quick reset every time — 3 pts
- I take a breath, then go — 2 pts
- Something different each time — 1 pts
- I think about the score — 0 pts

### Skill: Bounce back (`bounce`) — "Moving on quickly after a mistake"
**MC-bounce-1.** You make a big mistake in a match. How long does it bother you?
- A few seconds, then I move on — 3 pts
- About a minute — 2 pts
- Until the next break — 1 pts
- A long time — I stay upset — 0 pts

**MC-bounce-2.** You lost an important match. What do you do the next day?
- I pick one thing to work on — 3 pts
- I feel low, but still go to training — 2 pts
- I don’t want to talk about it — 1 pts
- I want to skip training — 0 pts

### Skill: Picture it (`picture`) — "Imagining yourself playing well"
**MC-picture-1.** Before a match, do you imagine yourself playing well?
- Yes, clearly — 3 pts
- Sometimes — 2 pts
- Not often — 1 pts
- I imagine things going wrong — 0 pts

**MC-picture-2.** When you imagine doing a skill, can you see and feel it in your head?
- Yes, like a video — 3 pts
- A little — it is blurry — 2 pts
- Not really — 1 pts
- I have never tried — 1 pts

**Result card wording:**
- unlocked: Card unlocked
- levelUp: Level up!
- mindLevel: Mind level
- superpower: You are best at
- growFirst: Work on this first
- notATest: A starting point to train from — not a test of who you are.
- share: Share my card
- shareText: My Mind Stats on Arjun
- continue: Continue
- nextIn: d <= 0 ? 'Rematch ready' : `Next challenge in ${d} day${d === 1 ? '' : 's'}`
- changed: `Lv ${from} → Lv ${to}`
- rematchLine: Practice is paying off.
- summaryTitle: Arjun’s note on your last challenge
- summaryTaken: `Taken on ${date}.`
- summaryBest: `You are strongest at ${skill} — ${meaning.toLowerCase()}.`
- summaryGrow: `${skill} is your best place to grow (${meaning.toLowerCase()}). Your training plan starts there.`
- summaryUp: `Since your challenge before: ${list} went up. Your practice is working.`
- summaryNext: `Until the next one, practise ${skill} a little each week — that is what moves the level.`
- continueDone: Back to my training plan

---

## 3. Skill lessons with quick-check quizzes (per sport)

### Focus words (self-talk) (`skillPathFocus`)

**skillPathFocus-cricket**
- training: situation: You get beaten in nets. | unhelpful: "I can't play this." | useful: "Watch. Next ball."
- competition: situation: You mistime a shot early. | unhelpful: "I've already blown it." | useful: "Reset. Play straight."
- Quiz 1: You get beaten in nets. Which words help you best? — options: "I can't play this." / **"Watch it. Next ball."** (correct) / "This session is finished."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a century.
- Quiz 3: You get out cheaply and are next in to field. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-football**
- training: situation: You misplace two passes in a drill. | unhelpful: "I'm messing everything up." | useful: "Scan. Next pass."
- competition: situation: You lose the ball early in the match. | unhelpful: "Don't make another mistake." | useful: "Next action. Stay available."
- Quiz 1: You lose the ball in training. Which words help you best? — options: "I always ruin drills." / **"Next action. Scan again."** (correct) / "Don't touch the ball again."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore coaching. / Guarantee a win.
- Quiz 3: Your mind drifts to a mistake mid-match. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-badminton**
- training: situation: You lose a few rallies in practice. | unhelpful: "I've lost control." | useful: "Move early. One rally."
- competition: situation: You go behind in the first game. | unhelpful: "This is slipping." | useful: "Next point. Recover."
- Quiz 1: You lose three points in a row. Which words help most? — options: "I've lost control." / **"One point. Move early."** (correct) / "Everyone is better."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a win.
- Quiz 3: Your mind drifts to the score mid-game. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-athletics**
- training: situation: You start a set badly. | unhelpful: "This session is gone." | useful: "Reset rhythm. Next rep."
- competition: situation: Your start feels off. | unhelpful: "I've ruined this." | useful: "Drive. Stay tall."
- Quiz 1: Your rhythm drops in a set. What helps most? — options: "This is gone." / **"Reset rhythm. Next rep."** (correct) / "Stop trying."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a personal best.
- Quiz 3: Your start feels off in a race. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-wrestling**
- training: situation: You get taken down in practice. | unhelpful: "He is too strong for me." | useful: "Low stance. Next grip."
- competition: situation: You give up an early point. | unhelpful: "I've already lost." | useful: "Reset stance. Keep pushing."
- Quiz 1: You get taken down in practice. Which words help you best? — options: "I can't beat anyone." / **"Low stance. Next grip."** (correct) / "Practice is ruined."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a medal.
- Quiz 3: You lose the first period. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-boxing**
- training: situation: You get caught on the pads drill. | unhelpful: "I'm too slow today." | useful: "Hands up. Move."
- competition: situation: You take a clean punch in round one. | unhelpful: "I'm losing this." | useful: "Breathe. Stick to the jab."
- Quiz 1: You get hit in sparring. Which words help you best? — options: "I'm useless today." / **"Hands up. Move."** (correct) / "Stop sparring."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a win.
- Quiz 3: Your mind stays on the punch you took. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-kabaddi**
- training: situation: You get tackled in practice raids. | unhelpful: "I can't get past them." | useful: "Quick feet. Find the gap."
- competition: situation: You are caught on your first raid. | unhelpful: "I let the team down." | useful: "Next raid. Stay sharp."
- Quiz 1: You get tackled on a raid. Which words help you best? — options: "I'll never get through." / **"Next raid. Quick feet."** (correct) / "Let someone else raid."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a win.
- Quiz 3: Your mind drifts to a failed raid mid-match. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-tennis**
- training: situation: You miss five forehands in a row. | unhelpful: "My forehand is gone." | useful: "Watch the ball. Swing free."
- competition: situation: You double fault on a big point. | unhelpful: "I always choke." | useful: "Next point. Slow down."
- Quiz 1: You lose a long rally on a big point. Which words help most? — options: "I always lose these." / **"Next point. Watch the ball."** (correct) / "This match is over."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a win.
- Quiz 3: Your mind drifts to a bad line call. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-hockey**
- training: situation: You miss traps in a drill. | unhelpful: "I can't control anything today." | useful: "Soft hands. Next ball."
- competition: situation: You miss a penalty corner. | unhelpful: "I wasted our chance." | useful: "Next play. Stick down."
- Quiz 1: You lose the ball in the circle. Which words help most? — options: "I keep messing up." / **"Next play. Stick down."** (correct) / "Don't ask for the ball."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a goal.
- Quiz 3: Your mind drifts to a missed chance mid-match. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-swimming**
- training: situation: Your times are slow in a set. | unhelpful: "I'm getting worse." | useful: "Long and strong. Next rep."
- competition: situation: Your turn feels slow in a race. | unhelpful: "My race is ruined." | useful: "Next stroke. Finish strong."
- Quiz 1: Your split is slow in training. Which words help most? — options: "I'm getting worse." / **"Long and strong. Next rep."** (correct) / "Why do I even train?"
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore your coach. / Guarantee a personal best.
- Quiz 3: You think about your time in the middle of a race. What should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

**skillPathFocus-generic**
- training: situation: You make a mistake in training. | unhelpful: "I always mess up." | useful: "Next action."
- competition: situation: You make a mistake in competition. | unhelpful: "I've ruined this." | useful: "Next action. Stay in it."
- Quiz 1: Which words help performance? — options: "I always mess up." / **"Next action."** (correct) / "Everyone is better than me."
- Quiz 2: What should focus words do? — options: **Bring your mind back to one action.** (correct) / Make you ignore coaching. / Guarantee success.
- Quiz 3: When your mind drifts in training, what should you do? — options: Judge yourself harder. / Stop trying. / **Notice it and return to your focus words.** (correct)

- After a right answer: That's it. Better focus words bring you back to the next action.
- After a wrong answer: Not quite. The best answer is the one that helps the next action.

### Pressure Reset (breathing) (`skillPathPressure`)

**skillPathPressure-cricket**
- training: situation: You get beaten in nets. | reaction: Grip tightens. Breathing speeds up. | reset: Exhale. Loosen hands. Watch the next ball.
- competition: situation: You mistime a shot early. | reaction: Body tightens. You start rushing. | reset: Breathe out. Reset stance. Next ball.
- Quiz 1: You get beaten in nets and your grip tightens. What helps first? — options: Grip harder and swing faster. / **Exhale, loosen hands, watch next ball.** (correct) / Replay the mistake in your head.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You get out cheaply and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole innings. / Judge yourself harder.

**skillPathPressure-football**
- training: situation: You rush your first touch during a drill. | reaction: Breathing gets fast. Shoulders tighten. | reset: Slow exhale. Relax shoulders. Next touch.
- competition: situation: You lose the ball early in the match. | reaction: Body speeds up. Mind jumps to the mistake. | reset: Breathe out. Scan. Get ready for the next play.
- Quiz 1: You lose the ball and feel your body rush. What helps first? — options: Push harder without thinking. / **Breathe out, scan, next play.** (correct) / Blame yourself for the loss.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You give the ball away and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole match. / Judge yourself harder.

**skillPathPressure-badminton**
- training: situation: You miss two easy shots in practice. | reaction: Feet get heavy. Breathing feels rushed. | reset: Exhale. Bounce light. One rally.
- competition: situation: You lose three points in a row. | reaction: Body tightens. You start forcing shots. | reset: Breathe out. Reset grip. Next point.
- Quiz 1: You lose points and start forcing shots. What helps first? — options: Force even harder. / **Breathe out, reset grip, next point.** (correct) / Think about the whole match.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You lose a rally and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole game. / Judge yourself harder.

**skillPathPressure-athletics**
- training: situation: Your rhythm drops during a set. | reaction: Breathing feels heavy. Body tenses. | reset: Long exhale. Relax face. Next rep.
- competition: situation: You feel tense before the start. | reaction: Shoulders rise. Breathing gets shallow. | reset: Exhale slowly. Set posture. First action.
- Quiz 1: Before your start, shoulders rise and breath gets shallow. What helps first? — options: Hold your breath and tense up. / **Slow exhale, set posture, first action.** (correct) / Worry about the result.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: Your start feels off and your body speeds up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole race. / Judge yourself harder.

**skillPathPressure-wrestling**
- training: situation: You get pinned in practice. | reaction: Breathing gets fast. Arms feel heavy. | reset: Long exhale. Shake arms. Next grip.
- competition: situation: Your hands shake before the bout. | reaction: Heart races. Legs feel weak. | reset: Breathe out slowly. Set stance. First grip.
- Quiz 1: Before your bout your heart races. What helps first? — options: Hold your breath and tense up. / **Slow exhale, set stance, first grip.** (correct) / Think about losing.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole bout. / Judge yourself harder.

**skillPathPressure-boxing**
- training: situation: You get tired fast in sparring. | reaction: Shoulders tighten. You hold your breath. | reset: Exhale through the mouth. Drop shoulders. Hands up.
- competition: situation: You wait in the corner before the bell. | reaction: Heart pounds. Stomach feels tight. | reset: Slow exhale. Loosen arms. First jab.
- Quiz 1: You get hit and your shoulders tighten. What helps first? — options: Throw wild punches. / **Exhale, drop shoulders, hands up.** (correct) / Replay the punch in your head.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole fight. / Judge yourself harder.

**skillPathPressure-kabaddi**
- training: situation: You rush a practice raid. | reaction: Breathing speeds up. Feet get stiff. | reset: Exhale. Bounce light. Next raid.
- competition: situation: It is a do-or-die raid. | reaction: Body tightens. You want to rush. | reset: Breathe out at the line. Quick feet. Go.
- Quiz 1: Before a do-or-die raid your body tightens. What helps first? — options: Rush in fast. / **Breathe out at the line, quick feet, go.** (correct) / Think about the score.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole match. / Judge yourself harder.

**skillPathPressure-tennis**
- training: situation: You miss easy balls in practice. | reaction: Arm gets tight. Breathing gets short. | reset: Exhale. Loosen grip. Next ball.
- competition: situation: You serve at break point. | reaction: Arm tightens. Toss goes wrong. | reset: Turn away. Slow exhale. Bounce, then serve.
- Quiz 1: At break point your arm feels tight. What helps first? — options: Hit harder. / **Turn away, slow exhale, then serve.** (correct) / Think about losing the set.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole match. / Judge yourself harder.

**skillPathPressure-hockey**
- training: situation: You rush passes in a drill. | reaction: Grip gets tight. Breathing speeds up. | reset: Exhale. Soft hands. Next pass.
- competition: situation: Your team concedes early. | reaction: Body tightens. You start chasing. | reset: Breathe out. Find your position. Next play.
- Quiz 1: Your team concedes and your body rushes. What helps first? — options: Chase everything. / **Breathe out, find your position, next play.** (correct) / Blame a teammate.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole match. / Judge yourself harder.

**skillPathPressure-swimming**
- training: situation: A hard set feels too fast. | reaction: Breathing gets choppy. Shoulders tighten. | reset: Long exhale at the wall. Relax shoulders. Next rep.
- competition: situation: You stand behind the blocks. | reaction: Heart races. Stomach feels tight. | reset: Slow exhale. Shake arms. Think about your start.
- Quiz 1: Behind the blocks your heart races. What helps first? — options: Hold your breath. / **Slow exhale, shake arms, think about your start.** (correct) / Think about your time.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole race. / Judge yourself harder.

**skillPathPressure-generic**
- training: situation: Training starts badly. | reaction: Your body gets tight and rushed. | reset: Slow exhale. Relax shoulders. Next action.
- competition: situation: Pressure rises before performance. | reaction: Breathing gets fast. Muscles tighten. | reset: Breathe out. Set body. Next action.
- Quiz 1: Your body feels tight before training. What helps most? — options: Rush harder. / **Slow your breathing and return to the next action.** (correct) / Keep thinking about what could go wrong.
- Quiz 2: Pressure Reset is mainly for: — options: Making pressure disappear forever. / **Steadying your body so you can act better now.** (correct) / Ignoring your body completely.
- Quiz 3: You make a mistake and feel your body speed up. What is the best first step? — options: **Breathe out slowly.** (correct) / Think about the whole session. / Judge yourself harder.

- After a right answer: That's it. Pressure Reset helps your body return to the next action.
- After a wrong answer: Not quite. The best answer is the one that steadies your body for the next action.

---

## 4. Tool intros and sport examples

- **Self-Talk Cards:** Strong words for tough moments. How it works: Pick a tough moment → Get your words → Save your card.
- **Mind Warm-up:** Get your mind ready in 4 minutes. How it works: Say how you feel → Pick one moment → Get your focus word.
- **Pressure Reset:** Calm your body with slow breathing. How it works: Rate how tight → Breathe slowly → Feel the change.

| Sport | Focus word | Reset word | Common mistake | Worried thought | Strong line | Example routine | Example Self-Talk intro line |
|---|---|---|---|---|---|---|---|
| cricket | Watch the ball | Next ball | Dropped an easy catch | Everyone saw that. | I have caught a hundred of these. | Before I bat: Two slow breaths → Tap the bat twice → Look at the sightscreen → Say “Watch it” | Dropped an easy catch? Say “Next ball”. |
| football | Next action | Go again | Missed an open goal | The coach will drop me. | I find space. I get the next one. | Before kick-off: Two slow breaths → Bounce on your toes → Look at the far goal → Say “First touch” | Missed an open goal? Say “Go again”. |
| badminton | Watch the shuttle | Next point | Lost five points in a row | I’m going to lose this game. | One rally at a time. I move well. | Before I serve: One slow breath out → Bounce the racket strings → Look at the spot you aim for → Say “Smooth” | Lost five points in a row? Say “Next point”. |
| athletics | Drive | Stay tall | Got a slow start | The race is already gone. | I have trained for this. My legs know the way. | Before my race: Two slow breaths → Shake out your arms → Look down your lane → Say “Drive” | Got a slow start? Say “Stay tall”. |
| wrestling | Low and strong | Reset stance | Got taken down early | He’s too strong for me. | I have trained harder. I keep pushing. | Before my bout: Two slow breaths → Slap your legs twice → Look at the centre circle → Say “Low and strong” | Got taken down early? Say “Reset stance”. |
| boxing | Hands up | Breathe, move | Got caught with a clean punch | I’m losing this round. | I stay calm. I stick to my plan. | Before the bell: Two slow breaths → Touch your gloves together → Look at your corner → Say “Hands up” | Got caught with a clean punch? Say “Breathe, move”. |
| kabaddi | Quick feet | Next raid | Got tackled on a raid | I let the team down. | I am quick. I find the gap. | Before I raid: One slow breath → Clap twice → Look at the baulk line → Say “Quick feet” | Got tackled on a raid? Say “Next raid”. |
| tennis | Watch the ball | Next point | Hit a double fault | I always choke on big points. | I swing freely. One point at a time. | Between points: Turn away and fix your strings → One slow breath out → Bounce the ball three times → Say “Swing free” | Hit a double fault? Say “Next point”. |
| hockey | Stick down | Next play | Missed a penalty corner | I wasted our chance. | I see the space. I play my game. | Before a corner: One slow breath out → Tap your stick on the turf → Look at your target → Say “Stick down” | Missed a penalty corner? Say “Next play”. |
| swimming | Long and strong | Next stroke | Had a slow turn | My time is ruined. | I have done this a thousand times in training. | Before my race: Two slow breaths → Shake out your arms → Look at the far wall → Say “Long and strong” | Had a slow turn? Say “Next stroke”. |
| other | Next play | Reset | Made an early mistake | Everyone saw that. | I have trained for this. One moment at a time. | Before I play: Two slow breaths → Shake out your hands → Look at one fixed spot → Say “Next play” | Made an early mistake? Say “Reset”. |

---

## 5. Onboarding questions

Shown in this order to every athlete: sport + role → level → hardest situation → what they notice first → ONE follow-up set for their situation → where pressure comes from (optional) → what already helps (optional) → their week (training time + next match). Each screen also says how Arjun uses the answer.

**Screens:**
- `sport`: What sport do you play? — Pick your main sport so Arjun can personalise your coaching.
- `sportRole`: What sport do you play? — Pick your sport, then your role. _(Arjun uses this to speak your sport — examples, plans and drawings.)_
- `level`: Level — Pick one _(Arjun uses this to pitch the coaching right — simple when you’re starting, sharper at state and national level.)_
- `firstSignal`: When it happens, what do you notice first? — Go with your gut. _(Arjun uses this to pick your first tool — body → Pressure Reset, thoughts → Self-Talk Cards and cue words, feelings → Mind Journal.)_
- `pressureSource`: Where does the pressure come from? — Pick up to three. Only Arjun sees this. _(Arjun uses this to understand where the pressure really comes from, so the advice fits your life.)_
- `whatHelps`: What already helps you? — Pick any. We build on what works. _(Arjun uses this to start from what already works for you instead of from zero.)_
- `trainingTime`: Your week — So Arjun shows up at the right time. _(Arjun uses this to send reminders before you train and get you ready the day before your match.)_
- `rolePosition`: What's your role, position or event? — Tell Arjun what you usually do in your sport.
- `playingContext`: Tell us about your playing experience — This helps Arjun understand the level and environment you compete in.
- `difficultMoments`: Which moments feel hardest right now? — Choose up to three.
- `primaryPriority`: Which situation gives you the most trouble right now? — Pick the one that happens most. Arjun starts here.
- `prePerformanceOnset`: When do you first notice the pressure or nerves?
- `prePerformanceSigns`: Before an important performance, what usually happens first?
- `prePerformanceEffect`: What usually happens to your performance next?
- `prePerformanceDuration`: How long does it usually take you to get back on track?
- `mistakesFirstResponse`: What usually happens first after you make a mistake?
- `mistakesNext`: What usually happens to your performance next?
- `mistakesRecovery`: How long does it usually take you to get back on track?
- `focusWhen`: What usually takes your focus away first?
- `focusEffect`: What usually happens to your performance next?
- `focusRecovery`: How long does it usually take you to get back on track?
- `confidenceTrigger`: What usually knocks your confidence first?
- `confidenceEffect`: What usually happens to your performance next?
- `confidenceRecovery`: How long does it usually take you to get back on track?
- `motivationWhen`: What usually drains your motivation first?
- `motivationEffect`: What usually happens to your training next?
- `motivationRecovery`: How long does it usually take you to get back on track?
- `coachSelectionMoment`: What usually gets to you first?
- `coachSelectionEffect`: What usually happens to your performance next?
- `coachSelectionRecovery`: How long does it usually take you to get back on track?
- `familyOutsideSource`: Where does the outside pressure mostly come from? — Choose up to two.
- `familyOutsideEffect`: When you compete, what usually happens first?
- `familyOutsideRecovery`: How long does it usually take you to get back on track?
- `injuryStage`: Where are you right now?
- `injuryConcern`: What's on your mind most?
- `injuryRecovery`: How long does it usually take you to get back on track?
- `unsureRecognition`: Which sounds most like you recently?
- `unsureRecovery`: How long does it usually take you to get back on track?
- `customResponse`: When that happens, what usually happens first?
- `customEffect`: What usually happens to your performance next?
- `customRecovery`: How long does it usually take you to get back on track?
- `contextualPressures`: What can make this harder? — Choose up to three. Optional.
- `supports`: When you're struggling, what usually helps you perform better? — Choose up to three.
- `strengths`: Which strengths can you rely on in sport? — Choose up to three. Optional.
- `broadGoals`: What would you like help with? — Choose up to three.
- `fourWeekOutcome`: What one change would make the biggest difference in the next four weeks? — Choose one.

**Answer options:**
- `OB-sport`: Cricket / Football / Badminton / Athletics / Wrestling / Boxing / Kabaddi / Tennis / Hockey / Swimming / Other sport
- `OB-rolePosition`: Batter / Bowler / All-rounder / Wicketkeeper / Goalkeeper / Defender / Midfielder / Forward / Singles / Doubles / Singles and doubles / No fixed role / I'm not sure / My role or event is different
- `OB-competitionLevel`: Just for fun / Club / District / Local tournaments / State level / National level / International / Other
- `OB-experienceLevel`: Just starting out / School or club / Semi-serious / Aspiring professional
- `OB-difficultMoments`: Nervousness before matches / When the pressure increases / After I make a mistake / After a poor result / When I lose focus / When my confidence drops / When training motivation is low / When my coach gives feedback / When selection feels uncertain / When family or outside expectations feel heavy / During injury or return to sport / I'm not sure yet / My situation is different
- `OB-prePerformanceOnset`: Hours or days before / On the day / During warm-up / Just before I perform / Only after the performance starts / It varies / I haven't noticed
- `OB-prePerformanceSigns`: Fast heartbeat or breathing / Tight or tense body / Negative thoughts / Thinking too much / Difficulty focusing / Feeling restless / Feeling low or flat / Extra energy that sometimes helps / Something else
- `OB-prePerformanceEffect`: I hesitate / I rush / I become too cautious / I lose focus / I make simple mistakes / I usually perform normally / The pressure sometimes helps me / It varies / Something else
- `OB-prePerformanceDuration`: It settles once I start / The first few minutes / Most of the performance / It lingers even after / It varies / I haven't noticed / Something else
- `OB-mistakesFirstResponse`: I keep thinking about it / I get angry with myself / I become cautious / I rush to correct it / I look at my coach or teammates / My body becomes tense / I usually reset quickly / I haven't noticed yet / Something else
- `OB-mistakesNext`: I hesitate / I make another mistake / I lose focus / I become too aggressive / I stop communicating / My confidence drops / My performance is mostly unchanged / It depends on the situation / Something else
- `OB-mistakesRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-focusWhen`: Before I start / After a mistake / Crowd or noise / The scoreboard or result / The opponent / My own thoughts / Late in the game / It varies / Something else
- `OB-focusEffect`: I miss cues / My reactions slow down / I make wrong decisions / I stop communicating / My energy drops / Mostly unchanged / Something else
- `OB-focusRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-confidenceTrigger`: After a mistake / After a poor result / Against a strong opponent / When I am being watched / After an early setback / Comparing with others / It varies / Something else
- `OB-confidenceEffect`: I play safe / I hesitate / I avoid the ball or action / Negative thoughts / My body tenses / Mostly unchanged / Something else
- `OB-confidenceRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-motivationWhen`: After a bad result / When training is repetitive / When I am tired or busy / When there is no clear goal / When I train alone / After an injury / It varies / Something else
- `OB-motivationEffect`: I skip or shorten training / I go through the motions / I lose focus / I enjoy it less / I still show up fully / Something else
- `OB-motivationRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-coachSelectionMoment`: Critical feedback / Feedback in front of others / Unclear expectations / Being compared with others / Selection feels uncertain / Fear of being dropped / It varies / Something else
- `OB-coachSelectionEffect`: I overthink / I play safe / I try too hard / I lose confidence / I withdraw / It motivates me / Mostly unchanged / Something else
- `OB-coachSelectionRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-familyOutsideSource`: Parents / Relatives / Friends or peers / School or teachers / Community or public / Social media / Prefer not to say / Something else
- `OB-familyOutsideEffect`: I feel extra pressure / I fear letting people down / I play safe / I overthink / I lose enjoyment / It motivates me / Mostly unchanged / Something else
- `OB-familyOutsideRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-injuryStage`: Recovering, not playing yet / Returned, building back / Fully back but still worried / Recurring niggles / Prefer not to say
- `OB-injuryConcern`: Fear of re-injury / Lost form / Lost fitness / Lost my place / I hesitate in contests / Frustrated or impatient / I feel fine / Something else
- `OB-injuryRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-unsureRecognition`: I perform differently in competition than training / One mistake affects several actions afterwards / I know what to do but hesitate under pressure / My focus moves away from the present moment / I compare myself with other athletes / I struggle to train consistently / I feel pressure to prove myself / None of these quite fit / Something else
- `OB-unsureRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-customResponse`: My body becomes tense / Negative thoughts / I lose focus / I hesitate / I get frustrated / I usually reset quickly / Something else
- `OB-customEffect`: I hesitate / I rush / I become too cautious / I make simple mistakes / I lose focus / Mostly unchanged / Something else
- `OB-customRecovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-firstSignal`: My body — tight shoulders, fast heartbeat, heavy legs / My thoughts — “don’t mess up”, replaying the mistake / My feelings — angry, scared, frustrated / Not sure yet
- `OB-whatHelps`: Music / Slow breathing / Talking to someone / A set routine / Praying / Visualising / Being alone / Nothing yet
- `OB-trainingTime`: Morning / Afternoon / Evening / It varies
- `OB-contextualPressures`: My own expectations / Coach feedback or behaviour / Family expectations / Comparison with other athletes / Selection pressure / School, exams or work / Money, travel or facilities / Injury or physical condition / Social media or public judgment / Nothing outside the performance itself / Something else
- `OB-supports`: Clear preparation / Focusing on one action / Encouragement from someone / Feeling physically ready / A routine before performing / Helpful words to myself / Staying relaxed / Competing aggressively / Enjoying the moment / Remembering previous success / I haven't noticed yet / Something else
- `OB-strengths`: Hard-working / Brave / Disciplined / Competitive / Calm / Persistent / Quick learner / Supportive teammate / Honest with myself / Still figuring this out / Something else
- `OB-recovery`: One or two actions / A few minutes / Most of the session or match / Even after it finishes / It varies / I haven't noticed / Something else
- `OB-broadGoals`: Focus & Concentration / Handling Pressure / Nerves Before Performing / Building Confidence / Recovering from Setbacks / Staying Motivated / Team Communication / Dealing with Injuries
- `OB-fourWeekOutcome`: Recover faster after mistakes / Feel more prepared before competing / Stay focused for longer / Trust myself under pressure / Train more consistently / Handle feedback better / Enjoy competing more / Return confidently after injury / Understand what is holding me back / My own goal
