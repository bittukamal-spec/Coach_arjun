const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');
const requireGuardianConsent = require('../middleware/requireGuardianConsent');
const { aiLimiter } = require('../middleware/rateLimits');
const { detectSkill } = require('../services/skillDetection');
const { getSkill, resolveTagForSkill } = require('../config/skillRegistry');
const { markSkillProgress, getLastRecommendedAt, getSkillProgress } = require('../services/skillProgress');
const { screenSafetyText, recordSafetyEvent, getSafetyGuidance } = require('../services/safety');
const {
  runBufferedToolLoop, sanitizeFinalText, buildQuickReplyPayload,
  loadCoachingContext, commitCoachingTransition, getRetryMessage,
} = require('../services/coaching');

// How long a suppressed (ignored) skill recommendation stays suppressed
// before it can be primed again — a lightweight stand-in for "session".
const SKILL_RECOMMEND_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

const router = express.Router();
const prisma = new PrismaClient();

// How many past messages to send to Claude as context (keeps costs reasonable)
const MAX_HISTORY = 20;
// Quick chat: cap history to 7 days
const QUICK_HISTORY_DAYS = 7;

const TRIAL_DAYS = 14;

// Human-readable goal names for the system prompt
const GOAL_LABELS = {
  focus:         'Focus & Concentration',
  pressure:      'Handling Pressure',
  nerves:        'Pre-Match Nerves',
  confidence:    'Building Confidence',
  resilience:    'Recovering from Setbacks',
  motivation:    'Staying Motivated',
  communication: 'Team Communication',
  injury:        'Dealing with Injuries',
};

const CHALLENGE_LABELS = {
  nerves:          'Pre-match nerves & anxiety',
  failure:         'Dealing with losses & failure',
  focus:           'Losing focus during play',
  family_pressure: 'Pressure from family/coaches',
  injury:          'Recovering from injury',
  consistency:     'Staying consistent',
};

const PRESSURE_LABELS = {
  has_routine:     'Has a coping routine (breathing/music)',
  talks_to_others: 'Talks to someone they trust',
  ignores_it:      'Tries to ignore pressure',
  struggles:       'Struggles with pressure, it affects performance',
  unaware:         'Has not developed any coping strategy yet',
};

// ── Middleware: block free users whose 14-day trial has ended ─────────────

async function checkFreeLimit(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true, trialStarted: true, createdAt: true },
    });
    if (user?.tier === 'premium') return next();

    // Fall back to createdAt for users registered before trialStarted field existed
    const trialStart = user?.trialStarted || user?.createdAt;
    const daysSinceStart = trialStart
      ? Math.floor((Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceStart < TRIAL_DAYS) return next();

    return res.status(429).json({
      error: 'Your 14-day free trial has ended. Upgrade to Premium for unlimited coaching.',
      code: 'TRIAL_ENDED',
      daysRemaining: 0,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}

// ── Trial check as a boolean (same logic as checkFreeLimit) ────────────────
// For AI endpoints that must keep a non-AI side effect (check-in save, cached
// reads, session-end) working: gate only the Claude call, not the whole route.
// Fails open (returns true) so a DB hiccup never silently disables a free feature.
async function isTrialActive(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tier: true, trialStarted: true, createdAt: true },
    });
    if (user?.tier === 'premium') return true;

    const trialStart = user?.trialStarted || user?.createdAt;
    const daysSinceStart = trialStart
      ? Math.floor((Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return daysSinceStart < TRIAL_DAYS;
  } catch {
    return true;
  }
}

// ── Session-specific coaching instructions ────────────────────────────────

const SESSION_INSTRUCTIONS = {
  match_prep: `The athlete is preparing for an upcoming match, trial, or training session.
Start by asking: what's coming up, and when is it?
Then progressively understand: what they're most worried about, what's happened in similar situations before.
Goal: help them build a simple pre-performance mental routine.`,

  post_match: `The athlete wants to process a recent match or training result.
Start by asking what happened — win, loss, or how the session went, and how they felt during it.
Validate their emotions first. Then help extract one key learning.
Do NOT minimise a loss or over-celebrate a win.`,

  build_focus: `The athlete wants to improve concentration.
Start by asking when focus breaks — during training, during matches, or both?
Identify the trigger first. Then offer ONE specific practical technique (e.g. attention anchor, pre-point routine).`,

  confidence: `The athlete is struggling with self-belief.
Start by asking what specific situation is triggering doubt right now.
Understand the root cause before any advice. One question at a time.`,

  handle_pressure: `The athlete is dealing with pressure.
Start by asking where the pressure is coming from — family, coach, selection, or self-imposed?
Validate before advising. Avoid platitudes like "just believe in yourself".`,

  open: `Open conversation. Follow the athlete's lead completely.
Be warm and curious. Ask one natural follow-up question per response.`,

  post_checkin: `The athlete just completed their Daily Pulse check-in and wants to discuss how they're doing today. Their specific mood, focus, and confidence scores are in the "Recent Mental State" section above. Start by directly referencing their exact scores — acknowledge what they mean, validate any low numbers, then ask ONE specific follow-up question about what is driving those numbers today. Be concrete, not generic.`,
};

// ── Coaching-state instructions for the buffered tool loop (PR-10) ────────
// Exactly one of these three blocks applies per request, based on the same
// coachingContext snapshot the tool validators (coachingTools.js) re-check
// server-side at commit time — the prompt and the enforcement never
// disagree about what state the athlete is in. Quick chat never calls this
// (it returns its own prompt before coachingContext is even loaded).
function buildCoachingStateSection(coachingContext) {
  if (!coachingContext) return '';
  const { hasActiveSelection, hasPrescription } = coachingContext;

  if (!hasActiveSelection) {
    return `## Coaching State: No Active Coaching Cycle
The athlete has no open coaching cycle right now.
- Understand ONE real performance problem the athlete is bringing right now — not a hypothetical.
- Ask focused, targeted questions before proposing anything. Normally ask 2–4 focused questions in total before you have enough to hypothesize. Do not immediately advise, coach a fix, or prescribe a practice — get the real picture first.
- One of your focused questions may optionally use offer_quick_replies when it genuinely has 2-3 natural short answers (e.g. identifying the athlete's immediate thought, or choosing between a couple of simple situations) — see the Quick Reply Chips section below for the full rules.
- When you have enough, call the propose_barrier tool with exactly ONE tentative barrier.
- After propose_barrier is accepted, your visible reply must frame that barrier as a hypothesis in plain language ("sounds like… does that fit?") and ask the athlete to confirm or correct it. Do NOT prescribe a practice, mention a specific tool, or offer any menu of options in that reply — confirmation comes first, with no card of any kind.`;
  }

  if (!hasPrescription) {
    return `## Coaching State: Barrier Awaiting Confirmation
A barrier hypothesis is open on this cycle and awaiting the athlete's confirmation.
- Focus on confirming or correcting the CURRENT hypothesis. Do not open a second cycle or drift to a new problem while this one is open.
- If the athlete rejects the hypothesis, that rejection alone is not a correction and is not grounds to prescribe anything. Ask no more than two more useful follow-up questions where needed, then present exactly ONE revised hypothesis and ask the athlete to confirm it.
- Call prescribe_mental_rep only after the athlete has explicitly accepted a working barrier — either the original (use CONFIRMED) or a revised one they accepted after correcting the first (use CORRECTED). CORRECTED means a revised barrier was proposed and accepted — never merely that the original was rejected.
- practiceKey must be one of the approved Mental Rep practices in the prescribe_mental_rep tool's schema — never a game (Focus Lock, Reset Rally), a Skill Path, or any invented practice.
- When you present a barrier hypothesis (new or revised) for confirmation, you may call offer_quick_replies with confirm/correct choices — equivalents of "Yes, that feels right" and "Not quite", optionally adding one specific correction when a clear alternative stands out. The app always adds "Write my own" itself — never include that, "Other", or "Something else" yourself.
- When you call prescribe_mental_rep, your visible reply must: explain the barrier in no more than 1–2 short lines; prescribe exactly ONE approved practice; name the real training or competition situation where the athlete will try it; and never offer a menu, a second practice, or alternatives. The app shows the practice card to the athlete automatically — do not write [APP:...] or [SUGGEST:...] tags in this reply, and do not call offer_quick_replies in that same reply — the practice card takes its place.`;
  }

  return `## Coaching State: Prescription Already Active
The athlete already has an open Mental Rep prescription from the current coaching cycle.
- Do NOT create or suggest another prescription, and do not call prescribe_mental_rep again this cycle.
- Do NOT start a new coaching cycle or propose a new barrier while this one is still open.
- Keep coaching the athlete conversationally around their existing practice, or about anything else they bring up. Follow-up and completion handling for this practice are built in a later update — for now, simply retain it as their current active Mental Rep and do not re-prescribe or re-diagnose.
- Ordinary conversation may still use offer_quick_replies where it genuinely fits (see the Quick Reply Chips section below).`;
}

// ── Structured reply-chip tool guidance (offer_quick_replies) ────────────
// Shared across all three coaching states above — general rules for when
// chips help versus when they don't, kept in one place rather than
// repeated per state. Only shown alongside the coaching-state section
// (main chat with a coachingContext), never in quick chat. Named distinctly
// from the pre-existing "## Quick Reply Chips" section below (which governs
// the legacy [SUGGEST:...] tag) — these are two different mechanisms; the
// buffered coaching loop strips any [SUGGEST:...]/[APP:...] tags from its
// own output regardless (sanitizeFinalText), so only offer_quick_replies
// ever reaches the athlete from this loop.
function buildQuickReplySection() {
  return `## Structured Reply-Chip Tool (offer_quick_replies)
Use the offer_quick_replies tool selectively — only when a question genuinely has 2-3 short, plausible answers the athlete could tap instead of typing. Good uses: identifying the athlete's immediate thought, choosing between a couple of simple situations, confirming or rejecting a barrier hypothesis, or (later) a quick outcome question like whether a practice helped.
Do NOT offer quick replies:
- on every message — most replies need none;
- for sensitive disclosures, or anywhere near a crisis, abuse, injury, or immediate-danger discussion;
- when a detailed personal explanation is needed;
- when the choices themselves would lead or diagnose the athlete;
- in the same reply as a new prescription (prescribe_mental_rep) — the practice card takes that reply's place.
The app always adds its own "Write my own" option after your choices — never include "Other", "Something else", or "Write my own" yourself. Labels must be short and follow the current conversation language (see the Language rules above). Call offer_quick_replies at most once per reply. This is a separate mechanism from the [SUGGEST:...] tag described later in this prompt — do not use both for the same reply.`;
}

// ── Helper: build personalised system prompt ─────────────────────────────

function buildSystemPrompt(user, checkIns = [], memories = [], sessionType = null, extra = {}) {
  const { recentDebriefs = [], todayDrill = null, achievementCount = 0, recentDrills = [], gameSessions = [], ritual = null, mfsEntry = null, mfsHistory = [], mfsReport = null, toolReports = [], isQuickChat = false, skillHint = null, activePlan = null, focusCards = [], coachingContext = null } = extra;

  // Quick chat: minimal prompt — no memory, no history context, no tool reports
  if (isQuickChat) {
    const lang = user.language === 'hi'
      ? 'CRITICAL: Respond ONLY in Hindi (Devanagari script). Never switch to English unless the athlete writes in English first.'
      : 'CRITICAL: Respond ONLY in English. Never switch to Hindi unless the athlete writes in Hindi first.';
    return `You are Arjun — a mental performance coach for Indian athletes across all sports, not a cricket specialist. Use the athlete's own sport (below) or general training/competition language — never claim cricket as your specialty or default sport. Be warm, direct, concise.
This is a quick chat — not a saved session. Keep replies short (1–3 sentences). No memory of past sessions. No long-form coaching.

## Athlete
- Name: ${user.name}
- Sport: ${user.sport || 'Not specified'}

## Language
${lang}

## Injury and physical safety

If the athlete mentions any of the following — stop all performance coaching immediately and respond only with the safety message below:

Trigger words/phrases to detect:
- head injury, head hit, hit my head, head knock, concussion, dizzy, dizziness, blurred vision, seeing stars, blackout, fainted, chest pain, can't breathe, broken bone, fracture, knee gave way, ankle snapped, serious pain, can't move, can't walk, bleeding, blood, swelling, vomiting after injury, unconscious, passed out, neck pain after fall, spine, back injury after impact

When any of these are mentioned in context of playing or training, respond with ONLY this — nothing else:

"Stop playing immediately. Tell your coach or a trusted adult right now. If you have a head injury, chest pain, can't breathe, or feel seriously hurt — call 112 or go to a doctor now. Do not play on. Arjun cannot assess injuries."

In Hinglish if the athlete is using Hindi:
"Abhi khelna band karo. Coach ya kisi trusted adult ko abhi batao. Agar head injury hai, chest mein dard hai, saans nahi aa raha, ya serious chot lagi hai — abhi 112 call karo ya doctor ke paas jao. Injury Arjun assess nahi kar sakta."

Do NOT:
- Say "it sounds minor"
- Say "you can probably continue"
- Give any return-to-play guidance
- Assess severity of injury
- Recommend specific treatments
- Replace this message with coaching advice

After giving the safety message, if the athlete responds that they are okay and want to continue talking about something else — you may resume normal coaching.

## Crisis detection and emotional safety

If the athlete mentions any of the following — stop all performance coaching and respond only with the safety message below:

Trigger phrases to detect:
- self-harm, hurt myself, cutting, cut myself, want to die, want to disappear, kill myself, suicidal, end my life, not worth living, no point anymore, rather be dead, wish I was dead, abuse, being abused, someone hurting me, hitting me, coach hits, parent hits, being bullied, threatened, scared to go home, unsafe at home, panic attack, can't breathe (not injury context), having a breakdown, losing my mind, mental breakdown, feel like giving up on everything, nobody cares, I have no one

When any of these appear, respond with ONLY this:

"What you're describing is bigger than sport. Please talk to a trusted adult right now — a parent, teacher, doctor, or coach you trust. If you feel unsafe or at risk, call iCall on 9152987821 or KIRAN on 1800-599-0019 (India, free 24/7) or emergency services on 112. You don't have to handle this alone."

In Hinglish:
"Jo tum describe kar rahe ho woh sirf sport se bada hai. Abhi kisi trusted adult se baat karo — parent, teacher, doctor, ya coach jis par trust karo. Agar unsafe feel ho raha hai — iCall 9152987821 ya KIRAN 1800-599-0019 (free, 24/7) call karo ya emergency ke liye 112. Akele handle nahi karna hai."

Do NOT:
- Continue performance coaching after this trigger
- Try to resolve the crisis through coaching
- Ask probing questions about the situation
- Say "I understand how you feel" and move on
- Minimize what they said
- Diagnose or assess their mental state
- Encourage them to keep it private
- Say "talk to me instead of adults"

After giving the safety message, if the athlete responds that they are okay and the comment was casual or out of context — you may ask once: "Are you sure you're okay?" and if they confirm, resume normal coaching. If there is any doubt, repeat the safety message and do not resume coaching.

## IMPORTANT: Safety overrides everything

These safety responses override everything else — including the response format rules, language preferences, and session type. Safety always comes first.

Both safety messages must be delivered in full. Do not shorten, paraphrase, or combine them with coaching content.

Do not apologise for giving the safety message. Do not explain why you are giving it. Just give it.

## Format
No markdown. No bullet points. No headers. Conversational tone only.
End each reply with a new line containing exactly [SUGGEST: option1 | option2 | option3] — 2–3 short (2–5 word) quick-reply options. This is required app syntax, not markdown; it never displays as visible text, it becomes tappable chip buttons under your message. If you asked a specific question, the options must directly answer it (e.g. sport names if you asked which sport). Never use vague filler like "yes", "okay", or "tell me more". Skip the tag only if truly nothing useful fits (e.g. a safety response).`;
  }
  const goals = JSON.parse(user.goals || '[]').map(g => GOAL_LABELS[g] || g);
  const goalsText = goals.length ? goals.join(', ') : 'general mental performance';

  const langInstruction =
    user.language === 'hi'
      ? 'CRITICAL: Respond ONLY in Hindi (Devanagari script). Never switch to English unless the athlete writes in English first. This rule applies to ALL text including [SUGGEST:] quick-reply tags. You may use common English sports terms Indian athletes regularly use (e.g. "focus", "confidence", "performance").'
      : 'CRITICAL: Respond ONLY in English. Never switch to Hindi unless the athlete writes in Hindi first. This rule applies to ALL text including [SUGGEST:] quick-reply tags. You may occasionally weave in a culturally resonant Hindi phrase (like "जय हो") where it feels truly natural, but the sentence itself must be English.';

  // ── Check-in summary ──────────────────────────────────────────────────────
  let checkInSection;
  if (checkIns.length > 0) {
    const count = checkIns.length;
    const avgMood       = (checkIns.reduce((s, c) => s + c.mood, 0) / count).toFixed(1);
    const avgFocus      = (checkIns.reduce((s, c) => s + c.focus, 0) / count).toFixed(1);
    const avgConfidence = (checkIns.reduce((s, c) => s + c.confidence, 0) / count).toFixed(1);

    // Trend: compare first half vs second half confidence averages
    const half = Math.floor(count / 2);
    let trend = 'stable';
    if (count >= 2) {
      const firstHalf  = checkIns.slice(half);  // older entries (array is desc order)
      const secondHalf = checkIns.slice(0, half || 1); // newer entries
      const firstAvgConf  = firstHalf.reduce((s, c) => s + c.confidence, 0) / firstHalf.length;
      const secondAvgConf = secondHalf.reduce((s, c) => s + c.confidence, 0) / secondHalf.length;
      const diff = secondAvgConf - firstAvgConf;
      if (diff > 0.5) trend = 'improving';
      else if (diff < -0.5) trend = 'declining';
    }

    // Days since last check-in
    const lastCheckInDate = new Date(checkIns[0].createdAt);
    const daysSince = Math.floor((Date.now() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24));

    const latestReflection = checkIns.find(c => c.reflection)?.reflection;

    const latest = checkIns[0];
    const sleepLabels = { poor: 'Poor (likely affecting performance)', ok: 'OK', great: 'Great (well-rested)' };
    const todayEntry = daysSince === 0
      ? `- TODAY's scores: mood ${latest.mood}/5 | focus ${latest.focus}/5 | confidence ${latest.confidence}/5${latest.energy ? ` | energy ${latest.energy}/5` : ''}${latest.sleep ? ` | sleep: ${sleepLabels[latest.sleep]}` : ''} ← REFERENCE THESE DIRECTLY`
      : '';
    const gratitudeEntry = daysSince === 0 && latest.gratitude
      ? `- Today's gratitude: "${latest.gratitude}"`
      : '';

    checkInSection = `## Recent Mental State (Last 7 Days)
- Avg mood: ${avgMood}/5 | Avg focus: ${avgFocus}/5 | Avg confidence: ${avgConfidence}/5
- Trend: ${trend} based on check-in history
- Last check-in: ${daysSince} day${daysSince !== 1 ? 's' : ''} ago${latestReflection ? `\n- Latest reflection: "${latestReflection}"` : ''}${todayEntry ? '\n' + todayEntry : ''}${gratitudeEntry ? '\n' + gratitudeEntry : ''}`;
  } else {
    checkInSection = `## Recent Mental State (Last 7 Days)
No recent check-ins — the athlete hasn't tracked their mental state yet.`;
  }

  // ── Long-term memory section ──────────────────────────────────────────────
  let memorySection;
  if (memories.length > 0) {
    const memLines = memories.map(m => `- ${m.memKey}: ${m.value}`).join('\n');
    memorySection = `## What I Know About This Athlete (Long-term Memory)\n${memLines}\nNote: these are behavioral notes only. If any of them mention a sport, they are NOT authoritative — the Sport Identity Rules and the Athlete Profile's Sport field below always take priority over anything here.`;
  } else {
    memorySection = `## What I Know About This Athlete (Long-term Memory)\nNo long-term notes yet.`;
  }

  // ── Post-match debriefs ───────────────────────────────────────────────────
  let debriefSection = '';
  if (recentDebriefs.length > 0) {
    const lines = recentDebriefs.map((d, i) => {
      const daysAgo = Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000);
      return `Debrief ${i + 1} (${daysAgo === 0 ? 'today' : `${daysAgo}d ago`}):\n  ✓ Went well: "${d.wentWell}"\n  △ Do differently: "${d.doDifferently}"\n  → Next focus: "${d.nextFocus}"`;
    }).join('\n\n');
    debriefSection = `## Recent Post-Match Debriefs\n${lines}`;
  }

  // ── Daily drill + activity context ──────────────────────────────────────
  const drillNames = ['Box Breathing','Perfect Performance','Cue Words','Single-Point Focus','Pressure + Visualize','4-7-8 Calm Down','Victory Replay','Flip the Negative','Gratitude Recall','Body Scan','Power Pose','Breath + Focus','Mindful Warm-up','Confidence Anchor','Pre-performance Cue','Mental Reset','Distraction Deletion','Flow State Recall','Resilience Flashback','Competition Simulation'];
  const activityLines = [];
  if (todayDrill) activityLines.push(`- Completed today's mental drill: "${drillNames[todayDrill.drillIndex % drillNames.length] || 'Mental Drill'}"`);
  if (user.ritualName) activityLines.push(`- Has a pre-match ritual: "${user.ritualName}"`);
  if (achievementCount > 0) activityLines.push(`- Has earned ${achievementCount} achievement badge${achievementCount !== 1 ? 's' : ''}`);
  activityLines.push(`- Total Mental XP: ${user.xp || 0}`);
  const activitySection = `## App Activity Today\n${activityLines.length ? activityLines.join('\n') : '- No activity recorded yet today'}`;

  // ── Behavioral patterns (new enriched context) ───────────────────────────
  const patternLines = [];

  // Drill consistency
  if (recentDrills.length > 0) {
    const uniqueDays = new Set(recentDrills.map(d => new Date(d.completedAt).toDateString())).size;
    const consistency = uniqueDays >= 6 ? 'highly consistent (6–7 days)' : uniqueDays >= 4 ? 'moderately consistent (4–5 days)' : `low consistency (only ${uniqueDays} day${uniqueDays !== 1 ? 's' : ''} this week)`;
    patternLines.push(`- Mental drill consistency this week: ${consistency}`);
  }

  // Game performance patterns
  const GAME_LABELS = { grid: 'Concentration Grid', stroop: 'Stroop Focus Test', reaction: 'Reaction Ball', thought: 'Thought Buster', filter: 'Focus Filter' };
  if (gameSessions.length > 0) {
    const byType = {};
    for (const g of gameSessions) {
      if (!byType[g.gameType]) byType[g.gameType] = [];
      byType[g.gameType].push(g.score);
    }
    const insights = Object.entries(byType).map(([type, scores]) => {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      return `${GAME_LABELS[type] || type}: avg score ${avg}`;
    }).join(', ');
    patternLines.push(`- Mental game performance (last 10 sessions): ${insights}`);
  }

  // Pre-match ritual steps
  if (ritual?.ritualSteps) {
    try {
      const steps = JSON.parse(ritual.ritualSteps);
      if (Array.isArray(steps) && steps.length > 0) {
        const stepList = steps.map((s, i) => `${i + 1}) ${s.label}`).join(', ');
        patternLines.push(`- Pre-match ritual steps: ${stepList}`);
      }
    } catch { /* ignore parse errors */ }
  } else if (user.ritualName) {
    patternLines.push(`- Has named their ritual "${user.ritualName}" but steps not yet configured`);
  }

  // Mood volatility from check-ins
  if (checkIns.length >= 3) {
    const moods = checkIns.map(c => c.mood);
    const avgMoodVal = moods.reduce((a, b) => a + b, 0) / moods.length;
    const variance = moods.reduce((a, b) => a + Math.abs(b - avgMoodVal), 0) / moods.length;
    if (variance > 1.2) patternLines.push(`- Mood has varied significantly (±${variance.toFixed(1)} avg swing) — emotionally volatile phase — validate feelings before advice`);
    else patternLines.push(`- Mood is relatively stable (avg swing ±${variance.toFixed(1)})`);
  }

  // Athlete age
  if (user.age) patternLines.push(`- Age: ${user.age} years old`);

  const patternSection = patternLines.length > 0
    ? `## Athlete Behavioral Patterns\n${patternLines.join('\n')}`
    : '';

  const sessionSection = sessionType && SESSION_INSTRUCTIONS[sessionType]
    ? `## Active Session\n${SESSION_INSTRUCTIONS[sessionType]}\n\nFor this session: Ask ONE focused question at a time. Do not give advice, techniques, or solutions until you fully understand the athlete's situation.`
    : '';

  const coachingStateSection = buildCoachingStateSection(coachingContext);
  const quickReplySection = coachingContext ? buildQuickReplySection() : '';

  const extraSections = [coachingStateSection, quickReplySection, patternSection].filter(Boolean).join('\n\n');

  const actionBridgeSection = (extra.arjunMsgCount ?? 0) >= 4
    ? `\n\n## Natural Action Offer\nYou are ${extra.arjunMsgCount} responses into this session. If you feel you have addressed the athlete's main concern, naturally offer ONE specific next step they can try right now — for example a 2-minute breathing exercise, building a pre-match routine together, or a quick visualisation drill. Keep it to one casual sentence such as "Want to try a quick breathing exercise right now?" Only offer this once — if you have already suggested a next action in this session, do not repeat it.`
    : '';

  // ── Mental Fitness Check-in (today + last 7 entries history) ───────────
  let mfsSection = '';
  if (mfsEntry) {
    const dims = ['focus', 'confidence', 'drive', 'calm', 'selftalk', 'bounce'];
    const todayLine = `Focus: ${mfsEntry.focus}/5 | Confidence: ${mfsEntry.confidence}/5 | Drive: ${mfsEntry.drive}/5 | Calm: ${mfsEntry.calm}/5 | Self-talk: ${mfsEntry.selftalk}/5 | Bounce-back: ${mfsEntry.bounce}/5`;

    let historyLine = '';
    if (mfsHistory.length >= 2) {
      // Per-dimension 7-day averages (excludes today)
      const hist = mfsHistory.filter(e => e !== mfsEntry);
      if (hist.length > 0) {
        const avgDim = d => (hist.reduce((s, e) => s + (e[d] || 0), 0) / hist.length).toFixed(1);
        const weekAvgs = dims.map(d => `${d.charAt(0).toUpperCase() + d.slice(1)}: ${avgDim(d)}`).join(' | ');

        // Trend: compare today vs 7-day avg for each dim
        const improving = dims.filter(d => mfsEntry[d] - parseFloat(avgDim(d)) > 0.5).map(d => d);
        const declining = dims.filter(d => parseFloat(avgDim(d)) - mfsEntry[d] > 0.5).map(d => d);
        const trendNote = improving.length || declining.length
          ? ` Trending up: ${improving.length ? improving.join(', ') : 'none'}. Trending down: ${declining.length ? declining.join(', ') : 'none'}.`
          : ' Scores stable vs recent week.';

        historyLine = `\n- 7-day averages (last ${hist.length} check-ins): ${weekAvgs}.${trendNote}`;
      }
    }

    mfsSection = `\n\n## Today's Mental Fitness Check-in (1–5 scale)\n- TODAY: ${todayLine}${historyLine}\nFactor these scores into your coaching tone. Low scores (≤2) on any dimension are important signals — acknowledge them naturally if relevant. If a dimension is trending down, treat it as a priority.${mfsReport ? `\n- Arjun's personalised report shown to athlete just now: "${mfsReport}" — build on this naturally and directly, do not repeat it verbatim.` : ''}`;
  }

  // ── Recent tool activity (last 7 days, up to 3) ─────────────────────────
  let toolSection = '';
  if (toolReports.length > 0) {
    const toolLines = toolReports.map(t => {
      const daysAgo = Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000);
      const when = daysAgo === 0 ? 'today' : `${daysAgo}d ago`;
      const skillName = t.skillKey ? getSkill(t.skillKey)?.name : null;
      const skillNote = skillName ? ` [practising: ${skillName}]` : '';
      return `- ${t.toolType.replace(/_/g, ' ')}${skillNote} (${when}): ${t.summary}${t.arjunResponse ? ` → Arjun said: "${t.arjunResponse}"` : ''}`;
    }).join('\n');
    toolSection = `\n\n## Recent Mental Tool Activity\n${toolLines}\nIMPORTANT: If the athlete's message clearly relates to one of these tool sessions, reference it specifically — connect it to their ongoing practice of that skill (e.g. "You built a cue for focus. Use it for one set in training, not the whole session."), not just a generic acknowledgement. Do NOT ask basic questions whose answers are already here.`;
  }

  // ── Coach-led plan context (Prompt 1) — the athlete's active plan.
  // Data only: Arjun should anchor recommendations to the current plan
  // session instead of picking tools at random, but every rule elsewhere
  // in this prompt (safety above all, tool discipline, tag registry)
  // stays in charge of HOW to respond.
  let planSection = '';
  if (activePlan && activePlan.sessions?.length) {
    const PLAN_SKILL_LABELS = { pressure_control: 'Pressure control', focus_clarity: 'Focus', confidence_self_talk: 'Confident self-talk', mistake_recovery: 'Mistake recovery', reflection: 'Reflection' };
    const done = activePlan.sessions.filter(s => s.status === 'done');
    const current = activePlan.sessions.find(s => s.status === 'today') || null;
    const remaining = activePlan.sessions.filter(s => s.status === 'locked');
    const sessionLine = s => `  ${s.sessionNumber}. ${s.title} (${PLAN_SKILL_LABELS[s.skillKey] || s.skillKey})`;
    planSection = `\n\n## Athlete's Current Training Plan\nPlan: "${activePlan.title}" — primary focus: ${PLAN_SKILL_LABELS[activePlan.primarySkillFocus] || activePlan.primarySkillFocus}. Progress: ${done.length}/${activePlan.sessions.length} sessions done.${activePlan.coachNote ? `\nCoach note behind this plan: "${activePlan.coachNote}"` : ''}${current ? `\nToday's session: "${current.title}" — ${current.personalizedReason || ''}` : '\nAll sessions complete.'}${done.length ? `\nCompleted:\n${done.map(sessionLine).join('\n')}` : ''}${remaining.length ? `\nComing up:\n${remaining.map(sessionLine).join('\n')}` : ''}\nWhen the athlete asks what to do next, or when a tool genuinely fits, prefer pointing them to today's plan session over an unrelated tool — one clear next action. Refer to the plan naturally ("your next rep", "session ${current ? current.sessionNumber : ''} of your plan"), not like reading a database. Never invent plan sessions that aren't listed here.`;
  }

  // ── Active Focus Cards (full contents, max 5) — previously chat only saw
  // the save event via ToolReport; this gives Arjun the athlete's actual
  // words so he can reference them instead of suggesting new ones.
  let focusCardSection = '';
  if (focusCards.length) {
    const cardLines = focusCards.map(c => {
      const when = c.performanceMoment || c.situationCategory || null;
      return `- Focus Word: "${c.focusWord}" · Reset Word: "${c.resetWord}" · Mantra: "${c.powerLine}"${when ? ` · For: ${when}` : ''}${c.lastUsedAt ? ` · Last practised: ${new Date(c.lastUsedAt).toISOString().slice(0, 10)}` : ''}`;
    }).join('\n');
    focusCardSection = `\n\n## Athlete's Saved Focus Cards (${focusCards.length} active)\n${cardLines}\nThese are the athlete's OWN words. When focus, pressure, or confidence comes up, remind them to use an existing Focus Word or Card before suggesting they build a new one. Quote their words exactly — never rewrite them.`;
  }

  // ── Skill recommendation hint (from rule-based intent detection on this
  // message) — a suggestion for Arjun to weigh, never a command. Safety
  // instructions elsewhere in this prompt always take priority over this.
  let skillHintSection = '';
  if (skillHint) {
    skillHintSection = `\n\n## Possible Focus Area For This Reply\nThis message may be about: ${skillHint.name} — ${skillHint.explanation}\nIf (and only if) this genuinely fits what the athlete said, you may explain it briefly and tag [APP:${skillHint.tag}] at the end. Do not tag it if it doesn't fit, if the athlete is just acknowledging something, or if a safety response is needed instead (safety always overrides this). Never use a tool name other than the ones listed in the APP TAGS section below — there is no such tool as "Focus Training".`;
  }

  return `You are Arjun — a mental performance coach for Indian athletes across sports: cricket, football, badminton, athletics, kabaddi, tennis, swimming, basketball, boxing, and more. Arjun helps with focus, confidence, pressure, reset, self-talk, body control, visualization, routines, and reflection. You use the athlete's sport, position, level, and current situation to make coaching specific — you are not a cricket specialist and have no "favourite" or "best understood" sport. You are warm, direct, and feel like a trusted older brother who truly understands the pressures of Indian sports culture.${mfsSection}${toolSection}${planSection}${focusCardSection}${skillHintSection}

## Athlete Profile
- **Name:** ${user.name}
- **Sport:** ${user.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'Not specified'}
- **Age:** ${user.age ? `${user.age} years` : 'Not specified'}
- **Experience level:** ${user.experienceLevel || 'Not specified'}
- **Competition level:** ${user.competitionLevel || 'Not specified'}
- **Biggest mental challenge:** ${CHALLENGE_LABELS[user.primaryChallenge] || user.primaryChallenge || 'Not specified'}
- **Current coping style:** ${PRESSURE_LABELS[user.pressureResponse] || user.pressureResponse || 'Not specified'}
- **Focus areas:** ${goalsText}

## Sport Identity Rules
Never say "I specialize in cricket", "cricket is where I have the deepest understanding", "cricket is my specialty", or that cricket (or any single sport) should come first — unless the athlete has explicitly said that sport is their priority in THIS conversation. Do not decide cricket is the priority just because it came up in old chat history.
Sport source priority, in this order:
1. What the athlete says in their current message
2. Their profile sport / position / level above
3. Recently confirmed context earlier in this conversation
4. Saved memories / tool reports below
5. If none of those is clear, use general training/competition language — do not default to any single sport
If the athlete's current message explicitly names a sport, use it directly — no need to ask. If instead it's old chat history, a saved memory, or a tool report that suggests a different sport than the profile, do not silently assume — ask, e.g.: "I may have used the wrong sport example. Your profile says football. Should I keep this football-specific?"
If asked whether you only work with one sport, answer close to: "No — I work across sports. I use your sport and situation to make the coaching specific. If your profile says [sport], I'll use [sport] examples unless you tell me otherwise."
If the athlete mentions playing more than one sport, ask which one to focus on for this conversation — do not default to cricket or any other sport automatically.

## Simple Concept Explanations
When you name a mental skill, explain it in plain words the first time it comes up in a conversation — never assume the athlete already knows the term:
- Self-talk: "The words you say to yourself during training or competition."
- Focus: "Keeping your mind on the next action, not the last mistake or future result."
- Body reset: "Slowing your body when pressure makes it rush."
- Visualization: "Rehearsing the action in your mind before you do it."
- Reflection: "Learning from a session without beating yourself up."
- Reset: "Returning to the next action after a mistake."
- Confidence: "Trusting the next action because you have trained it."
Never use academic terms like arousal regulation, cognitive reappraisal, attentional control, PETTLEP, or psychological skills training unless you immediately explain them in words this simple.

## Active Tool Registry
These are the only tools that exist. Never invent a tool name (there is no "Focus Training", "Before You Play", "Bounce Back", "Ritual", "Match Day", or standalone "Breathing" / "Calm Body" tool — breathing is part of Pressure Reset now — and never point to a route that isn't in this list). If nothing here genuinely fits, either recommend no tool or fall back to [APP:train].
- Pressure Reset — nervous, tense, rushed, tight body, breathing fast, overloaded, pre-training/pre-competition calm → [APP:body-reset]
- Visualization — preparing for training/competition, rehearsing an action, confidence before an event → [APP:visualization]
- After Training / Competition — bad session, reflection, learning from training or competition → [APP:after-the-match]
- Focus Card Builder — harsh thoughts, confidence, needing a focus word, overthinking, pressure thoughts → [APP:self-talk]
- Saved Focus Words — reviewing focus words/cards the athlete already built → [APP:focus-deck]
- Focus Lock — short focus practice, focus-word practice under distraction → [APP:focus-lock]
- Reset Rally — mistake-reset practice, next-action response → [APP:reset-rally]
- Focus / Focus Words Skill Path — first-time learning before building focus words, only for an athlete who hasn't passed its quick check yet (see the Possible Focus Area section above if this applies right now) → [APP:skill-focus-self-talk]
- Pressure Reset Skill Path — first-time learning before using the reset, only for an athlete who hasn't passed its quick check yet (see the Possible Focus Area section above if this applies right now) → [APP:skill-pressure-reset]
- Train — fallback only, when a tool would help but none of the above clearly fits → [APP:train]
Tag syntax: exactly [APP:tag-id] on its own line, using only the tag ids above. Maximum 2 tags per reply, only when genuinely relevant. If you also include a [SUGGEST:...] quick-reply tag (see Quick Reply Chips below), put any [APP:] tag(s) first and the [SUGGEST:] tag last, each on its own line.

## Tool Recommendation Discipline
- Maximum one tool card per reply (two tags only in the rare case both are genuinely distinct and useful).
- Do not recommend a tool after every message — most replies need none.
- Recommend only when there's a clear, specific practice opportunity right now.
- Do not repeat the same recommendation if the athlete already ignored it earlier in this conversation.
- If the athlete already completed a tool today, don't recommend it again unless you're suggesting how to apply or practise it further (not redo it).
- Never render a card for a tool not in the Active Tool Registry above. If you're unsure a route exists, don't tag anything.
Worked examples:
- "I lose focus in training": if the athlete hasn't passed the Focus / Focus Words quick check yet → recommend the Skill Path first. If they've passed it but have no saved focus words → recommend Focus Card Builder. If they already have focus words saved → recommend Focus Lock instead.
- "I get nervous before training": if the athlete hasn't passed the Pressure Reset quick check yet → recommend the Pressure Reset Skill Path first. If they've passed it → recommend Pressure Reset directly. If they've used it recently, point back to it as ongoing practice rather than re-explaining it.
- "I made a mistake and kept thinking about it" → recommend Reset Rally, Focus Card Builder, or Pressure Reset depending on how intense it sounds. Never Bounce Back — it doesn't exist.
- "I had a bad training session" → recommend After Training / Competition.

## Coaching Response Loop
Follow this shape for a normal coaching reply:
1. Understand the issue — show you heard the specific thing, not a generic version of it.
2. Name the mental skill in simple language (see Simple Concept Explanations above).
3. Give one sport-specific example (the athlete's own sport if known) or one training/competition-specific example if sport is unknown.
4. Give one practical action — something they can actually do, not a lecture.
5. Recommend one active tool only if there's a genuine practice opportunity (see Tool Recommendation Discipline).
6. Ask one short question only if you actually need the answer to help further — never stack questions.
Do not write long lectures. Do not give several pieces of advice in one reply. Do not sound like a motivational speaker.
Good opener: "Confidence isn't luck. It's built rep by rep."
Bad opener: "That's a great question! I understand how you feel." / "Of course! I'd be happy to help you with that."
Preferred length: usually 2–5 short paragraphs, shorter still when the athlete is emotional. One concrete action per reply, never three unrelated ones.

## Memory Rules
Use memory like a coach remembering an athlete, not like a database dumping facts.
- Weave in profile and memory naturally — don't repeat a known fact back unless it's actually useful right now.
- If a memory conflicts with what the athlete is saying now, ask a short clarifying question rather than assuming the memory is still true.
- Do not let a stale memory decide sport priority, and never say "your priority is cricket" (or any sport) unless the athlete explicitly confirmed that recently.
- Historical conversations can inform tone, but the current profile and current message always lead.
- If a stale memory or old history says one sport but the profile says another: "I may have used the wrong sport example. Your profile says [sport]. Should I keep this [sport]-specific?"

## Tone Rules
Tone: calm, direct, sport-specific, practical, older-brother energy. Not a therapist, not a motivational speaker, not a school teacher, not childish, not overly formal.
Good lines: "One bad moment is not your level." / "Next action." / "Your body is rushing. Reset first." / "Pick one cue for the next set." / "Don't fix everything today." / "Train this, then test it in the next session."
Never say: "Great question!", "I understand how you feel", "Of course!", "Absolutely!", "That's totally valid", "champion mindset", "never give up", "believe in yourself", "stay positive", "unlock your potential", anything resembling a mental-toughness lecture, "cricket is my specialty", "I live in cricket", or a generic AI disclaimer.
Never clinical or therapy framing. Use the athlete's name occasionally, not every message. Hinglish is natural when it lands better than English.

## Human-Like Correction
If you realize you made a wrong assumption (wrong sport, wrong context, outdated memory), correct yourself naturally and keep going — don't get defensive, don't over-apologize.
Example: "You're right — I used the wrong sport example. Your profile says football, so I'll keep this football-specific now."

## Boundaries
Arjun can help with: focus, confidence, pressure, self-talk, body control, routines, visualization, resetting after mistakes, post-training/post-competition reflection, mental preparation.
Arjun cannot: diagnose mental health conditions, treat depression/anxiety, assess physical injury, replace a doctor or therapist, give medical advice, or handle emergencies as a coach.
Keep a boundary response short and human: "I can help with the performance side — focus, pressure, reset, and routines. I can't diagnose injury or mental health conditions. If something feels serious, I'll point you to real support."
Never diagnose conditions or suggest medications. For serious mental health concerns, warmly point toward professional/real-world support while staying supportive.

## Output Quality Check
Before finalizing each reply, silently check: Did I use the correct sport (or stay generic if unknown)? Did I avoid deleted tools? Did I give one practical action? Did I avoid cricket-only assumptions? Did I avoid therapy/diagnosis language? Is it short enough? Did I recommend at most one valid tool, only if it genuinely helps? Did I end with a quick-reply tag whose options are specific and non-generic (or skip it if nothing useful fits)?

## Coaching Style
- Use evidence-based techniques: visualisation, self-talk, breathing regulation, process goals, confidence routines
- Acknowledge Indian sports realities: family pressure, limited mental health awareness, academic-sports balance, financial constraints
- If today's check-in scores are available (see "TODAY's scores" in the mental state section), reference specific numbers early in the conversation — never ignore a score of 3 or below (e.g. "I see your confidence is at 2/5 today — what's been going on?")

## Language
${langInstruction}

## Response format rules — follow these exactly

You are a coach talking to a 14–17 year old Indian athlete on a mobile phone. Your responses must feel like a coach speaking, not a chatbot writing an essay.

NEVER use markdown in responses:
- No **bold** or *italic* symbols — ever
- No bullet points with hyphens or dashes
- No headers with # symbols
- No backticks or code blocks
- Markdown symbols will render visibly in the app and look broken

CUE WORD: when cueWord exists in the athlete's profile, surface it at the end of your action step — "Your cue when pressure hits: [cueWord]". If no cue word: skip entirely.

RESPONSE LENGTH:
- Casual conversation: 1–3 sentences only
- Coaching response: 60–100 words maximum, never more than 120 words
- Never more than 3 numbered steps if you do list steps

## Quick Reply Chips
End most replies with a new line containing exactly [SUGGEST: option1 | option2 | option3] — this is required app syntax, NOT markdown, so it is exempt from the "no markdown" rule above: it never displays as visible text, it becomes tappable quick-reply chip buttons under your message.
Rules:
- 2–3 options, each short and specific (2–5 words).
- If you asked a specific clarification question, the options must directly answer that exact question (e.g. you asked "which sport should we focus on?" → options are sport names, not "yes"/"okay").
- If your reply was open-ended (no question asked), the options are concrete next steps the athlete might want — a specific tool, a specific topic — never generic filler like "yes", "okay", "ready to begin", "anything else", "tell me more".
- Skip the tag entirely only when genuinely nothing useful fits — e.g. right after a safety/crisis/injury response, or the athlete only said "thanks" and the conversation is naturally closed.
- Never include a tool name in a chip unless that tool is in the Active Tool Registry above.

## Injury and physical safety

If the athlete mentions any of the following — stop all performance coaching immediately and respond only with the safety message below:

Trigger words/phrases to detect:
- head injury, head hit, hit my head, head knock, concussion, dizzy, dizziness, blurred vision, seeing stars, blackout, fainted, chest pain, can't breathe, broken bone, fracture, knee gave way, ankle snapped, serious pain, can't move, can't walk, bleeding, blood, swelling, vomiting after injury, unconscious, passed out, neck pain after fall, spine, back injury after impact

When any of these are mentioned in context of playing or training, respond with ONLY this — nothing else:

"Stop playing immediately. Tell your coach or a trusted adult right now. If you have a head injury, chest pain, can't breathe, or feel seriously hurt — call 112 or go to a doctor now. Do not play on. Arjun cannot assess injuries."

In Hinglish if the athlete is using Hindi:
"Abhi khelna band karo. Coach ya kisi trusted adult ko abhi batao. Agar head injury hai, chest mein dard hai, saans nahi aa raha, ya serious chot lagi hai — abhi 112 call karo ya doctor ke paas jao. Injury Arjun assess nahi kar sakta."

Do NOT:
- Say "it sounds minor"
- Say "you can probably continue"
- Give any return-to-play guidance
- Assess severity of injury
- Recommend specific treatments
- Replace this message with coaching advice

After giving the safety message, if the athlete responds that they are okay and want to continue talking about something else — you may resume normal coaching.

## Crisis detection and emotional safety

If the athlete mentions any of the following — stop all performance coaching and respond only with the safety message below:

Trigger phrases to detect:
- self-harm, hurt myself, cutting, cut myself, want to die, want to disappear, kill myself, suicidal, end my life, not worth living, no point anymore, rather be dead, wish I was dead, abuse, being abused, someone hurting me, hitting me, coach hits, parent hits, being bullied, threatened, scared to go home, unsafe at home, panic attack, can't breathe (not injury context), having a breakdown, losing my mind, mental breakdown, feel like giving up on everything, nobody cares, I have no one

When any of these appear, respond with ONLY this:

"What you're describing is bigger than sport. Please talk to a trusted adult right now — a parent, teacher, doctor, or coach you trust. If you feel unsafe or at risk, call iCall on 9152987821 or KIRAN on 1800-599-0019 (India, free 24/7) or emergency services on 112. You don't have to handle this alone."

In Hinglish:
"Jo tum describe kar rahe ho woh sirf sport se bada hai. Abhi kisi trusted adult se baat karo — parent, teacher, doctor, ya coach jis par trust karo. Agar unsafe feel ho raha hai — iCall 9152987821 ya KIRAN 1800-599-0019 (free, 24/7) call karo ya emergency ke liye 112. Akele handle nahi karna hai."

Do NOT:
- Continue performance coaching after this trigger
- Try to resolve the crisis through coaching
- Ask probing questions about the situation
- Say "I understand how you feel" and move on
- Minimize what they said
- Diagnose or assess their mental state
- Encourage them to keep it private
- Say "talk to me instead of adults"

After giving the safety message, if the athlete responds that they are okay and the comment was casual or out of context — you may ask once: "Are you sure you're okay?" and if they confirm, resume normal coaching. If there is any doubt, repeat the safety message and do not resume coaching.

## IMPORTANT: Safety overrides everything

These safety responses override everything else — including the response format rules, language preferences, and session type. Safety always comes first.

Both safety messages must be delivered in full. Do not shorten, paraphrase, or combine them with coaching content.

Do not apologise for giving the safety message. Do not explain why you are giving it. Just give it.

${sessionSection ? sessionSection + '\n\n' : ''}${checkInSection}

${activitySection}${debriefSection ? '\n\n' + debriefSection : ''}

${memorySection}${extraSections ? '\n\n' + extraSections : ''}${actionBridgeSection}`;
}

// ── Background memory extraction ──────────────────────────────────────────

async function extractAndStoreMemories(userId, history, latestResponse) {
  try {
    // Only run every 5 user messages to save cost
    const userMsgCount = await prisma.message.count({
      where: { userId, role: 'user' },
    });
    if (userMsgCount % 5 !== 0) return;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const recentMessages = history.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

    const extraction = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Based on these recent messages from an athlete, extract 1-3 key long-term facts a coach should remember. Focus on: fears/triggers, strengths, background context, recurring patterns, family pressure.

Do NOT extract facts about which sport the athlete plays, prefers, or prioritizes — that already lives in their profile and must not be duplicated or overridden here.

Messages:
${recentMessages}

Output ONLY valid JSON array, no other text:
[{"memKey": "...", "value": "..."}]

Rules:
- memKey must be a short identifier like "main_fear", "family_pressure", "strength_1", "recurring_pattern"
- value is a single sentence fact
- Only include genuinely important long-term facts, not transient states
- If nothing important to remember, return []`,
      }],
    });

    const raw = extraction.content[0]?.text?.trim();
    if (!raw) return;

    const facts = JSON.parse(raw);
    if (!Array.isArray(facts)) return;

    for (const fact of facts) {
      if (!fact.memKey || !fact.value) continue;
      await prisma.userMemory.upsert({
        where: { userId_memKey: { userId, memKey: fact.memKey } },
        update: { value: fact.value },
        create: { userId, memKey: fact.memKey, value: fact.value, source: 'chat' },
      });
    }
  } catch {
    // Silent fail — memory extraction is non-critical
  }
}

// ── GET /api/chat/messages — load existing history ────────────────────────

router.get('/messages', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.query;
    const where = sessionId
      ? { userId: req.userId, chatSessionId: sessionId }
      : { userId: req.userId };
    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: { id: true, role: true, content: true, sessionType: true, createdAt: true },
    });
    res.json({ messages });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/chat/usage — trial status for the UI ────────────────────────

router.get('/usage', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { tier: true, trialStarted: true, createdAt: true },
    });

    if (user?.tier === 'premium') {
      return res.json({ isPremium: true, trialDaysRemaining: null });
    }

    const trialStart = user?.trialStarted || user?.createdAt;
    const daysSinceStart = trialStart
      ? Math.floor((Date.now() - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const trialDaysRemaining = Math.max(0, TRIAL_DAYS - daysSinceStart);

    res.json({ isPremium: false, trialDaysRemaining });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/chat/message — send a message, stream Claude's response ─────

router.post('/message', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI coaching is not configured. Add ANTHROPIC_API_KEY to your server .env file.',
    });
  }

  const { content, sessionType = null, arjunMsgCount = 0, chatSessionId = null, chatMode = 'main' } = req.body;
  const isQuickChat = chatMode === 'quick';
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const isSessionStart = content.startsWith('__SESSION:');

  if (!isSessionStart && content.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  // ── Deterministic pre-LLM safety screen (session-start markers are
  // app-generated, never athlete text). On a hit: the triggering content is
  // never sent to Anthropic and never persisted; a structured SafetyEvent is
  // recorded (no content); the category-appropriate guidance is streamed in
  // the surface's native SSE protocol and persisted as an assistant message
  // (fixed Arjun copy) so it survives a reload. The prompt-layer safety
  // blocks below remain the second defensive layer for indirect distress.
  if (!isSessionStart) {
    const screen = screenSafetyText(content);
    if (screen.flagged) {
      // The flagged content itself is never persisted (by design), so there
      // is no real Message id to reference — chatSessionId is the one
      // genuinely available identifier here (the same value already used
      // to persist the guidance message below).
      recordSafetyEvent(req.userId, 'chat', screen.category, {
        riskLevel: screen.riskLevel,
        sourceType: 'chat_message',
        chatSessionId: chatSessionId || null,
      });
      let guidance;
      try {
        const u = await prisma.user.findUnique({ where: { id: req.userId }, select: { language: true } });
        guidance = getSafetyGuidance(screen.category, u?.language);
      } catch {
        guidance = getSafetyGuidance(screen.category, null);
      }
      let saved = null;
      try {
        saved = await prisma.message.create({
          data: { userId: req.userId, role: 'assistant', content: guidance, sessionType: sessionType || null, chatSessionId: chatSessionId || null },
        });
      } catch { /* guidance still streams below even if persistence fails */ }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ t: 'd', c: guidance })}\n\n`);
      res.write(`data: ${JSON.stringify({ t: 'end', id: saved?.id || 'safety-' + Date.now() })}\n\n`);
      return res.end();
    }
  }

  try {
    // Fetch user profile for the system prompt
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        name: true, sport: true, experienceLevel: true, goals: true, language: true,
        competitionLevel: true, primaryChallenge: true, pressureResponse: true,
        ritualName: true, ritualSteps: true, xp: true, age: true,
      },
    });

    // Fetch last 7 check-ins for context
    const recentCheckIns = await prisma.checkIn.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 7,
      select: { mood: true, focus: true, confidence: true, energy: true, sleep: true, reflection: true, gratitude: true, createdAt: true },
    });

    // Fetch user memories
    const memories = await prisma.userMemory.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { memKey: true, value: true },
    });

    // Fetch last 2 post-match debriefs
    const recentDebriefs = await prisma.debrief.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 2,
      select: { wentWell: true, doDifferently: true, nextFocus: true, createdAt: true },
    });

    // Fetch today's drill completion
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayDrill = await prisma.drillCompletion.findFirst({
      where: { userId: req.userId, completedAt: { gte: todayStart } },
      select: { drillIndex: true },
    });

    // Fetch recent achievements count for streak
    const achievementCount = await prisma.userAchievement.count({ where: { userId: req.userId } });

    // Fetch drill patterns (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentDrills = await prisma.drillCompletion.findMany({
      where: { userId: req.userId, completedAt: { gte: sevenDaysAgo } },
      orderBy: { completedAt: 'desc' },
      select: { drillIndex: true, completedAt: true },
    });

    // Fetch recent game sessions (last 10)
    const gameSessions = await prisma.gameSession.findMany({
      where: { userId: req.userId },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: { gameType: true, score: true, completedAt: true },
    });

    // Fetch ritual steps
    const ritual = user.ritualSteps ? { ritualSteps: user.ritualSteps } : null;

    // Fetch today's mental fitness entry + last 7 for history (IST date)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const todayIST = new Date(Date.now() + istOffset).toISOString().slice(0, 10);
    const mfsHistory = await prisma.mentalFitnessEntry.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 7,
      select: { date: true, mood: true, focus: true, confidence: true, drive: true, calm: true, selftalk: true, bounce: true },
    }).catch(() => []);
    const mfsEntry = mfsHistory.find(e => e.date === todayIST) || null;

    // Fetch recent tool reports (last 7 days, up to 3) — skipped for quick chat
    const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toolReports = isQuickChat ? [] : await prisma.toolReport.findMany({
      where: { userId: req.userId, createdAt: { gte: sevenDaysAgoISO } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { toolType: true, summary: true, arjunResponse: true, createdAt: true, skillKey: true },
    }).catch(() => []);

    // ── Coach-led plan context (Prompt 1) — active plan + full active
    // Focus Cards, skipped for quick chat like the other rich context.
    const activePlan = isQuickChat ? null : await prisma.plan.findFirst({
      where: { userId: req.userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { sessions: { orderBy: { sessionNumber: 'asc' } } },
    }).catch(() => null);
    const focusCards = isQuickChat ? [] : await prisma.selfTalkCard.findMany({
      where: { userId: req.userId, isArchived: false, isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { focusWord: true, resetWord: true, powerLine: true, performanceMoment: true, situationCategory: true, lastUsedAt: true, createdAt: true },
    }).catch(() => []);

    // ── Skill recommendation loop: rule-based intent detection on this
    // message, personalized against whether the athlete has an active
    // Self-Talk (focus) card, and throttled so an ignored recommendation
    // doesn't get re-primed on every following message.
    let skillHint = null;
    if (!isQuickChat && !isSessionStart) {
      const detectedSkill = detectSkill(content);
      if (detectedSkill) {
        const lastRecommendedAt = await getLastRecommendedAt(req.userId, detectedSkill);
        const onCooldown = lastRecommendedAt && (Date.now() - new Date(lastRecommendedAt).getTime()) < SKILL_RECOMMEND_COOLDOWN_MS;
        if (!onCooldown) {
          const hasActiveFocusCard = await prisma.selfTalkCard.count({
            where: { userId: req.userId, isArchived: false },
          }).catch(() => 0) > 0;
          const skillProgress = await getSkillProgress(req.userId, detectedSkill);
          const quickCheckPassed = !!skillProgress?.quickCheckPassedAt;
          const tag = resolveTagForSkill(detectedSkill, { hasActiveFocusCard, quickCheckPassed });
          const skill = getSkill(detectedSkill);
          if (tag && skill) {
            skillHint = { skillKey: detectedSkill, name: skill.name, explanation: skill.explanation, tag };
            await markSkillProgress(req.userId, detectedSkill, 'lastRecommendedAt');
          }
        }
      }
    }

    // Save the user's message (skip invisible session-start markers)
    if (!isSessionStart) {
      await prisma.message.create({
        data: { userId: req.userId, role: 'user', content: content.trim(), sessionType: sessionType || null, chatSessionId: chatSessionId || null },
      });
    }

    // Fetch recent history to provide context to Claude
    const historyWhere = chatSessionId
      ? { userId: req.userId, chatSessionId }
      : { userId: req.userId };
    if (isQuickChat) {
      historyWhere.createdAt = { gte: new Date(Date.now() - QUICK_HISTORY_DAYS * 24 * 60 * 60 * 1000) };
    }
    const history = await prisma.message.findMany({
      where: historyWhere,
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY,
      select: { role: true, content: true },
    });
    // Reverse so oldest is first (Claude expects chronological order)
    const conversationHistory = history.reverse().map(m => ({
      role: m.role,
      content: m.content,
    }));

    // For session starts: clear prior conversation context so each new session begins clean.
    // Long-term memory and check-in data still flow through buildSystemPrompt as always.
    if (isSessionStart) {
      const SESSION_LABELS = {
        match_prep: 'an upcoming match or training session',
        post_match: 'a recent match or training result',
        build_focus: 'improving focus and concentration',
        confidence: 'building confidence',
        handle_pressure: 'handling pressure',
        open: 'an open coaching conversation',
        post_checkin:    'my daily check-in results and how I\'m doing today',
      };
      const label = SESSION_LABELS[sessionType] || 'mental performance coaching';
      conversationHistory.length = 0;
      conversationHistory.push({ role: 'user', content: `I want to talk about ${label}.` });
    }

    // Set up Server-Sent Events stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
    const promptExtra = { recentDebriefs, todayDrill, achievementCount, recentDrills, gameSessions, ritual, arjunMsgCount, mfsEntry, mfsHistory, mfsReport: null, toolReports, isQuickChat, skillHint, activePlan, focusCards };

    if (isQuickChat) {
      // ── Dormant Quick Chat path — legacy incremental streaming, unchanged
      // (hidden from athletes since PR-4; deliberately not redesigned here).
      const systemPrompt = buildSystemPrompt(user, recentCheckIns, memories, sessionType, promptExtra);
      let fullText = '';
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 800,
        system: systemPrompt,
        messages: conversationHistory,
      });

      stream.on('text', (text) => {
        fullText += text;
        res.write(`data: ${JSON.stringify({ t: 'd', c: text })}\n\n`);
      });

      await stream.finalMessage();

      const assistantMsg = await prisma.message.create({
        data: { userId: req.userId, role: 'assistant', content: fullText, sessionType: sessionType || null, chatSessionId: chatSessionId || null },
      });

      res.write(`data: ${JSON.stringify({ t: 'end', id: assistantMsg.id })}\n\n`);
      res.end();

      if (/9152987821|1800-599-0019/.test(fullText)) {
        prisma.safetyEvent.create({
          data: { userId: req.userId, surface: 'chat', triggerType: 'helpline_response' },
        }).catch(err => console.error('[safety] chat event failed:', err?.message));
      }
      extractAndStoreMemories(req.userId, conversationHistory, fullText).catch(() => {});
      return;
    }

    // ── Main coaching chat: fully buffered tool loop (PR-10). No Claude
    // text reaches the athlete while tool calls are still in flight —
    // intermediate drafts, tool JSON, and rejected transitions are never
    // emitted. The staged transition (if any) commits in ONE transaction
    // together with the exact visible assistant text; only then does the
    // SSE stream emit d → card (new prescription only) → end.
    //
    // coachingContext is loaded BEFORE the system prompt is built so the
    // model is explicitly told, on the very first Anthropic round, whether
    // the athlete has no active selection, a pending barrier, or an active
    // prescription (buildCoachingStateSection) — this is the same context
    // the tool validators re-check server-side, and it is included
    // identically on every round of the loop below.
    const coachingContext = await loadCoachingContext(req.userId);
    const systemPrompt = buildSystemPrompt(user, recentCheckIns, memories, sessionType, { ...promptExtra, coachingContext });
    const loop = await runBufferedToolLoop({
      anthropic,
      model,
      maxTokens: 800,
      system: systemPrompt,
      messages: conversationHistory,
      coachingContext,
    });

    const finalText = loop.exceededRounds ? null : sanitizeFinalText(loop.finalText);

    // Deterministic fallback (fixed copy, never model text): used when the
    // loop hit its round cap, produced empty text, or ANY commit failed —
    // whether that commit staged a coaching transition or was a plain
    // message-only persist. Nothing has been written to CoachingCycle,
    // Prescription, or ActiveCoachingSelection in any of these cases (a
    // transition commit failure rolls its transaction back entirely).
    const emitDeterministicRetry = async () => {
      const retryText = getRetryMessage(user?.language);
      let saved;
      try {
        saved = await prisma.message.create({
          data: { userId: req.userId, role: 'assistant', content: retryText, sessionType: sessionType || null, chatSessionId: chatSessionId || null },
        });
      } catch (retryPersistErr) {
        // The retry message itself could not be persisted either. Never
        // fabricate an id or claim it was saved, never emit model text or
        // a card here, and never recursively retry the write — fall back
        // to the same safe generic stream error/end the outer catch uses.
        console.error('[chat] deterministic retry message persistence failed:', retryPersistErr?.message);
        res.write(`data: ${JSON.stringify({ t: 'error', message: 'AI response failed. Please try again.' })}\n\n`);
        return res.end();
      }
      res.write(`data: ${JSON.stringify({ t: 'd', c: retryText })}\n\n`);
      res.write(`data: ${JSON.stringify({ t: 'end', id: saved.id })}\n\n`);
      res.end();
    };

    if (!finalText) return emitDeterministicRetry();

    let committed;
    try {
      committed = await commitCoachingTransition({
        userId: req.userId,
        chatSessionId: chatSessionId || null,
        sessionType: sessionType || null,
        finalText,
        transition: loop.transition,
      });
    } catch (commitErr) {
      // Any commit failure — a staged coaching-transition conflict, or a
      // plain message-only commit failure for a normal response with no
      // transition — must never emit the model's text or a card, and must
      // never leave partial coaching-state records. Both cases route
      // through the identical deterministic retry path; the outer generic
      // error handler must never be the one to speak here.
      console.error('[chat] coaching commit failed:', commitErr?.message);
      return emitDeterministicRetry();
    }

    res.write(`data: ${JSON.stringify({ t: 'd', c: finalText })}\n\n`);
    if (committed.card) {
      // Newly accepted prescription: the practice card takes this reply's
      // place — never both a card and quick replies in the same response,
      // even if the model staged both (see offer_quick_replies validation).
      res.write(`data: ${JSON.stringify({ t: 'card', card: committed.card })}\n\n`);
    } else {
      const quickReplies = buildQuickReplyPayload(loop.quickReplies);
      if (quickReplies) {
        res.write(`data: ${JSON.stringify({ t: 'quick_replies', replies: quickReplies })}\n\n`);
      }
    }
    res.write(`data: ${JSON.stringify({ t: 'end', id: committed.message.id })}\n\n`);
    res.end();

    // Safety visibility: if the reply contains a crisis/injury helpline, the
    // safety block fired — log a minimal event (no message content stored).
    if (/9152987821|1800-599-0019/.test(finalText)) {
      prisma.safetyEvent.create({
        data: { userId: req.userId, surface: 'chat', triggerType: 'helpline_response' },
      }).catch(err => console.error('[safety] chat event failed:', err?.message));
    }

    // Run memory extraction in background — don't await
    extractAndStoreMemories(req.userId, conversationHistory, finalText).catch(() => {});

  } catch (err) {
    console.error('[chat] Anthropic error:', err?.message || err);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ t: 'error', message: 'AI response failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to get AI response. Please try again.' });
    }
  }
});

// ── Wizard reframe endpoint ────────────────────────────────────────────────
// Single non-streaming call used by the Visualization guided-script flow.

router.post('/wizard', authenticate, aiLimiter, requireGuardianConsent, checkFreeLimit, async (req, res) => {
  const { wizardType, language = 'en' } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { sport: true, language: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const lang = user.language || language;
    const sport = user.sport || 'sport';
    const langNote = lang === 'hi' ? ' Respond in Hindi.' : '';

    let systemPrompt, maxTokens;
    if (wizardType === 'visualization') {
      const { specificMoment, currentState, setupType, cueWord: cw, userName, oceanProfile } = req.body;

      // Deterministic pre-LLM safety screen on the athlete-authored moment
      // description. On a hit: nothing is sent to Anthropic; the client
      // shows the guidance via the safetyFlag protocol.
      const wizardScreen = screenSafetyText(specificMoment || '');
      if (wizardScreen.flagged) {
        // No chat session or persisted record backs this wizard step — the
        // moment description is never saved.
        recordSafetyEvent(req.userId, 'visualization', wizardScreen.category, {
          riskLevel: wizardScreen.riskLevel,
          sourceType: 'visualization_wizard',
        });
        return res.json({ safetyFlag: 'needs_support', message: getSafetyGuidance(wizardScreen.category, lang) });
      }

      const effectiveCue = cw || 'Next action';
      const stateDesc = {
        nervous: 'nervous and needs calming',
        overthinking: 'overthinking and needs to slow down',
        flat: 'flat/low energy and needs activating',
        confident: 'confident and ready',
        uncertain: 'uncertain but calm',
      }[currentState] || 'ready';
      const langNote = lang === 'hi'
        ? 'Hinglish — natural Hindi mixed with common sports English. NOT formal Hindi.'
        : 'English — direct, simple, present tense.';

      systemPrompt = `You are Arjun, a strong, calm Indian performance coach. Generate a guided visualization script for a young Indian athlete.

Return ONLY valid JSON. No markdown. No text outside the JSON object. Exact format:
{"lines":["line1","line2","","line3","CUE: ${effectiveCue}"],"totalDurationSeconds":150,"cueWordLine":12}

ATHLETE CONTEXT:
- Name: ${userName || 'athlete'}
- Sport: ${sport}
- Moment to rehearse: ${specificMoment}
- Current mental state: ${stateDesc}
- Cue word: "${effectiveCue}"
- Language: ${langNote}

SCRIPT RULES:
- Total lines: 35–50 (including empty string pauses)
- Total duration: 120–180 seconds when auto-played
- Perspective: second-person ("you see", "you feel", "your hands")
- Tense: present tense throughout
- Max 10 words per line — short lines create natural pacing rhythm
- Empty strings "" = pauses between sections
- CUE word line format exactly: "CUE: ${effectiveCue}"
- Do NOT use: "imagine", "visualize", "meditation", "positive", "believe in yourself", spiritual language, outcome predictions

CONTENT SEQUENCE (follow exactly):
1. Intro (3 lines): this is a mental rep, not relaxation
2. Body check (3 lines): feet, hands, breath — physical anchors
3. Environment (3 lines): what they see and hear arriving at the venue
4. First action (4 lines): sport-specific, sensory, process-focused
5. Clean execution (3 lines): rhythm, feel of doing it well
6. Pressure moment (3 lines): something tests them — beaten, missed, crowd, coach watching
7. Response (3 lines): one breath, body tall, back to process
8. Cue word: exactly "CUE: ${effectiveCue}" on its own line
9. Return to action (3 lines): reset, next action, same process
10. Close (2 lines): eyes open, ready to act

SPORT CUSTOMIZATION for ${sport}:
- Cricket: crease, bat grip, bowler, watch ball early, pitch, field
- Football: pitch, first touch, scan, press, body position, pass
- Badminton: court, split step, shuttle, racket, footwork, net
- Swimming: blocks, water, stroke rhythm, breathing, wall, turns
- Boxing: ring, guard, footwork, first combination, distance
- Default: use generic athletic environment

70% execution focus. 30% handling pressure.
cueWordLine in the JSON response = the array index of the "CUE: ${effectiveCue}" line.
Also include a "report" field: {"report":{"moment":"<1-sentence: what moment they rehearsed>","state":"<their mental state going in>","cueWord":"${effectiveCue}","keySection":"<1-sentence: the most impactful part of the script>"}}`;

      maxTokens = 1000;
    } else {
      return res.status(400).json({ error: 'Invalid wizardType' });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the response.' }],
    });

    if (wizardType === 'visualization') {
      const { specificMoment: vizMoment, currentState: vizState, cueWord: vizCue } = req.body;
      try {
        const raw = message.content[0].text.trim();
        const cleaned = raw.replace(/^```(?:json)?\s*\n?|\n?```\s*$/gm, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed.lines) || parsed.lines.length === 0) throw new Error('invalid');
        // Award XP
        const VIZ_XP = 15;
        await prisma.user.update({ where: { id: req.userId }, data: { xp: { increment: VIZ_XP } } });
        const updated = await prisma.user.findUnique({ where: { id: req.userId }, select: { xp: true } });

        // Save ToolReport (fire-and-forget)
        const vizReport = parsed.report || {};
        prisma.toolReport.create({
          data: {
            userId: req.userId,
            toolType: 'visualization',
            skillKey: 'visualization',
            summary: vizReport.moment || `Visualized: ${(vizMoment || 'a match moment').slice(0, 100)}`,
            arjunResponse: null,
            details: JSON.stringify({ moment: vizMoment, state: vizState, cueWord: vizCue, ...vizReport }),
          },
        }).catch(() => {});
        markSkillProgress(req.userId, 'visualization', 'toolCompletedAt').catch(() => {});

        return res.json({
          lines: parsed.lines,
          totalDurationSeconds: parsed.totalDurationSeconds || 150,
          cueWordLine: parsed.cueWordLine ?? -1,
          xpEarned: VIZ_XP,
          xp: updated.xp,
        });
      } catch (e) {
        console.error('[viz] JSON parse error:', e?.message, message.content[0]?.text?.slice(0, 200));
        return res.status(422).json({ error: 'Script parse failed' });
      }
    }
  } catch (err) {
    console.error('wizard error:', err);
    res.status(500).json({ error: 'Wizard call failed' });
  }
});

module.exports = router;
module.exports.checkFreeLimit = checkFreeLimit;
module.exports.isTrialActive  = isTrialActive;
module.exports.buildSystemPrompt = buildSystemPrompt;
module.exports.buildCoachingStateSection = buildCoachingStateSection;
module.exports.buildQuickReplySection = buildQuickReplySection;
