// Content review pack (founder, Nov 2026): every lesson, Mind Challenge
// question, scoring rule, quiz, tool intro and onboarding question as the
// athlete sees it — plus a prompt for an AI deep-research review.
// Built from the app's own text so it never drifts. Re-run after changes:
//
//   node client/scripts/review-pack.mjs
//
// Writes docs/review/ARJUN-CONTENT-REVIEW.md
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { translations } from '../src/i18n/translations.js';
import { onboardingV2En as ob } from '../src/i18n/onboardingV2.js';
import { sportBlock, introExamples } from '../src/i18n/sportExamples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', '..', 'docs', 'review', 'ARJUN-CONTENT-REVIEW.md');
const en = translations.en;
const p = en.path;
const c = en.challenge;
const lines = [];
const w = (s = '') => lines.push(s);
const str = (v) => (typeof v === 'function' ? v(1, 2) : v);
const SPORTS = ['cricket', 'football', 'badminton', 'athletics', 'wrestling', 'boxing', 'kabaddi', 'tennis', 'hockey', 'swimming'];

// ── The prompt ───────────────────────────────────────────────────────────────
w('# Arjun — content review pack');
w('');
w(`Generated ${new Date().toISOString().slice(0, 10)} from the app's own text (\`node client/scripts/review-pack.mjs\`). Paste the prompt below into an AI research tool with deep research / web search switched on, and attach or paste this whole file after it.`);
w('');
w('## The prompt');
w('');
w('```text');
w(`You are a reviewer with expertise in applied sport psychology, youth athlete development and psychological measurement (psychometrics). I am a sport psychologist and the founder of "Arjun", a mobile app that coaches the mental side of sport for young Indian athletes aged 14–25 (cricket, football, badminton, athletics, wrestling, boxing, kabaddi, tennis, hockey, swimming). It is performance coaching, NOT therapy or diagnosis. Screens are in simple English for readers whose first language may not be English.

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
6. Reference list.`);
w('```');
w('');
w('**Notes for you (not for the AI):** AI research tools can invent references. Open every source before you rely on it. A review like this checks the *content*; it cannot prove the Mind Challenge measures what it says — that needs real answers from athletes (step 5 of the plan).');
w('');
w('**Placeholders:** lessons use `{focusWord}`, `{resetWord}` and `{unit}`. The app fills them from the athlete\'s sport — for cricket: focus word "Watch the ball", reset word "Next ball", unit "ball"; for tennis: "Watch the ball", "Next point", "point". Section 4 lists every sport.');
w('');

// ── 1. Training plan ────────────────────────────────────────────────────────
w('---');
w('');
w('## 1. Training plan — 6 chapters × 3 levels');
w('');
w('Each level = the same 4 steps: **Learn** (2-minute lesson) → **Try it** (practise in the app) → **Use it** (in training or a match) → **Look back** (one line in the Mind Journal). Level 1 Basics · Level 2 In the match · Level 3 Big pressure. The first chapter is chosen from what the athlete says is hardest; the next chapter opens after Level 1.');
w('');
Object.entries(p.chapters).forEach(([key, ch], i) => {
  w(`### Chapter ${i + 1} — ${ch.title} (\`${key}\`)`);
  w(`_${ch.line}_`);
  w('');
  [1, 2, 3].forEach(level => {
    const L = level === 1 ? ch : { ...ch, ...p.chapterLevels[key][level] };
    const id = `L-${key}-${level}`;
    w(`**${id} · Level ${level} (${p.levelNames[level]}) — "${L.lesson.title}"**`);
    L.lesson.cards.forEach((card, n) => w(`${n + 1}. ${card}`));
    w(`- Takeaway: ${L.lesson.takeaway}`);
    w(`- Try it: ${L.practise}`);
    w(`- Use it: ${L.play}`);
    w('');
  });
});

// ── 2. Mind Challenge ───────────────────────────────────────────────────────
w('---');
w('');
w('## 2. Mind Challenge (self-check)');
w('');
w(`**Intro:** ${c.introTitle} — ${c.introLine}`);
w('');
w(`**${c.introWhyTitle}:**`);
(c.introWhy || []).forEach(x => w(`- ${typeof x === 'string' ? x : JSON.stringify(x)}`));
(c.introFacts || []).forEach(x => w(`- ${typeof x === 'string' ? x : JSON.stringify(x)}`));
w(`- Instruction on every question: "${c.questionHelp}"`);
w('');
w('**Scoring (exactly as the app does it):**');
w('- Each skill has 2 items, each answer worth 0–3 points → 0–6 points per skill.');
w('- Focus has 1 question + a 15-second game: tap only blue balls among coral/yellow/green ones; game points from (hits − wrong taps): ≥8 → 3, 5–7 → 2, 2–4 → 1, <2 → 0.');
w('- Points → Level: 0–1 → Level 1, 2 → Level 2, 3–4 → Level 3, 5 → Level 4, 6 → Level 5.');
w('- "Mind Level" = the average of the 6 skill levels, rounded (minimum 1).');
w('- "Your superpower" = highest skill level; "Level up first" = lowest (ties go to the earlier skill in this order: calm, focus, confidence, routine, bounce, picture).');
w('- It can be retaken every 28 days; the card then shows then-vs-now.');
w('');
w('**What each level is called:**');
Object.entries(c.levelLines || {}).forEach(([n, line]) => w(`- Level ${n}: ${str(line)}`));
w('');
Object.entries(c.questions).forEach(([skill, qs]) => {
  w(`### Skill: ${c.skills[skill]} (\`${skill}\`) — "${c.skillMeaning[skill]}"`);
  qs.forEach((q, i) => {
    w(`**MC-${skill}-${i + 1}.** ${q.q}`);
    q.a.forEach(([text, pts]) => w(`- ${text} — ${pts} pts`));
    w('');
  });
  if (skill === 'focus') {
    w(`**MC-focus-game.** ${c.game.title}: ${c.game.line} (Why, as shown: "${c.game.why}")`);
    w('');
  }
});
w('**Result card wording:**');
Object.entries(c.card || {}).forEach(([k, v]) => w(`- ${k}: ${typeof v === 'function' ? v.toString().replace(/^\([^)]*\)\s*=>\s*/, '') : v}`));
w('');

// ── 3. Skill lessons with quizzes ───────────────────────────────────────────
w('---');
w('');
w('## 3. Skill lessons with quick-check quizzes (per sport)');
w('');
for (const [ns, title] of [['skillPathFocus', 'Focus words (self-talk)'], ['skillPathPressure', 'Pressure Reset (breathing)']]) {
  const t = en[ns];
  w(`### ${title} (\`${ns}\`)`);
  w('');
  if (t.learn) {
    for (const [k, v] of Object.entries(t.learn)) if (typeof v === 'string') w(`- ${k}: ${v}`);
    w('');
  }
  for (const sport of [...SPORTS, 'generic']) {
    const ex = t.example[sport];
    const quiz = t.quiz.bySport[sport];
    if (!ex) continue;
    w(`**${ns}-${sport}**`);
    for (const part of ['training', 'competition']) {
      const e = ex[part];
      w(`- ${part}: ${Object.entries(e).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
    }
    (quiz || []).forEach((item, i) => {
      w(`- Quiz ${i + 1}: ${item.q} — options: ${item.options.map((o, j) => (j === item.correct ? `**${o}** (correct)` : o)).join(' / ')}`);
    });
    w('');
  }
  w(`- After a right answer: ${t.quiz.correctFeedback}`);
  w(`- After a wrong answer: ${t.quiz.wrongFeedback}`);
  w('');
}

// ── 4. Tool intros and sport examples ───────────────────────────────────────
w('---');
w('');
w('## 4. Tool intros and sport examples');
w('');
const ti = en.toolIntro;
for (const [k, name] of [['selfTalk', 'Self-Talk Cards'], ['warmUp', 'Mind Warm-up'], ['reset', 'Pressure Reset']]) {
  w(`- **${name}:** ${ti[k].desc} How it works: ${ti[k].steps.join(' → ')}.`);
}
w('');
w('| Sport | Focus word | Reset word | Common mistake | Worried thought | Strong line | Example routine | Example "${tool}" line |'.replace('"${tool}" line', 'Self-Talk intro line'));
w('|---|---|---|---|---|---|---|---|');
for (const sport of [...SPORTS, 'other']) {
  const s = sportBlock(sport);
  w(`| ${sport} | ${s.focusWord} | ${s.resetWord} | ${s.mistake} | ${s.worry} | ${s.strongLine} | ${s.routine.title}: ${s.routine.steps.join(' → ')} | ${introExamples(sport).selfTalk} |`);
}
w('');

// ── 5. Onboarding ───────────────────────────────────────────────────────────
w('---');
w('');
w('## 5. Onboarding questions');
w('');
w('Shown in this order to every athlete: sport + role → level → hardest situation → what they notice first → ONE follow-up set for their situation → where pressure comes from (optional) → what already helps (optional) → their week (training time + next match). Each screen also says how Arjun uses the answer.');
w('');
w('**Screens:**');
for (const [k, s] of Object.entries(ob.screens)) {
  w(`- \`${k}\`: ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}${s.uses ? ` _(Arjun uses this to ${s.uses})_` : ''}`);
}
w('');
w('**Answer options:**');
for (const [k, v] of Object.entries(ob)) {
  if (['ui', 'stages', 'screens'].includes(k) || !v || typeof v !== 'object') continue;
  const opts = Object.values(v).filter(x => typeof x === 'string');
  if (opts.length) w(`- \`OB-${k}\`: ${opts.join(' / ')}`);
}
w('');

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'));
console.log('wrote', OUT, lines.length, 'lines');
