const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
const prisma = new PrismaClient();

// How many past messages to send to Claude as context (keeps costs reasonable)
const MAX_HISTORY = 20;

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

const STYLE_INSTRUCTIONS = {
  short:      'Keep responses very brief — 1–2 sentences. Answer directly, no padding.',
  honest:     'Be direct and unfiltered — say what needs to be said without softening.',
  thoughtful: 'Give a reflective, nuanced response. Slightly longer is fine when it serves the athlete.',
  motivating: 'Be energetic and encouraging — raise their spirits and fire them up.',
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

// ── Session-specific coaching instructions ────────────────────────────────

const SESSION_INSTRUCTIONS = {
  match_prep: `The athlete is preparing for an upcoming match.
Start by asking: what sport is the match for, and when is it?
Then progressively understand: what they're most worried about, what's happened in similar situations before.
Goal: help them build a simple pre-match mental routine.`,

  post_match: `The athlete wants to process a recent match result.
Start by asking what happened — win or loss, and how they felt during it.
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

  pressure_reset: `The athlete is in a high-pressure moment right now — before a match, a big game, or a crucial performance. They may be nervous, anxious, or overwhelmed. Your ONLY job right now is to calm, ground, and focus them in 3–4 short exchanges. Do not give long coaching advice.

Your FIRST reply in this session must start with: "I'm here. Tell me — how are you feeling right now, one word or as much as you want." (If the user's language is Hindi, translate naturally.)

Then guide them through: (1) one breath cue, (2) a simple reframe of nerves as readiness, (3) their cue word or a suggested one if they have no ritual set. End with a single confidence statement. Keep every reply under 3 sentences. Do not ask multiple questions.`,

  setback_reset: `The athlete has just had a bad game, made a serious mistake, or experienced a significant setback. They may feel frustrated, ashamed, or deflated. Your ONLY job right now is to help them process and stabilise in 3–4 short exchanges. Do NOT use toxic positivity or rush to silver linings.

Your FIRST reply in this session must start with: "That was tough. I'm not going to rush you — tell me what happened." (If the user's language is Hindi, translate naturally.)

Start by fully acknowledging what happened and validating the feeling. Then guide them through: (1) separating the performance from their identity, (2) one thing in their control next time, (3) a self-compassion reframe. End with one forward-looking sentence. Keep replies short. Do not rush the process.`,
};

// ── Helper: build personalised system prompt ─────────────────────────────

function buildSystemPrompt(user, checkIns = [], memories = [], sessionType = null, extra = {}) {
  const { recentDebriefs = [], todayDrill = null, achievementCount = 0, recentDrills = [], gameSessions = [], ritual = null, replyStyle = null, mfsEntry = null, mfsHistory = [], mfsReport = null } = extra;
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
    memorySection = `## What I Know About This Athlete (Long-term Memory)\n${memLines}`;
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

  // ── OCEAN personality profile ────────────────────────────────────────────
  let oceanSection = '';
  if (user.oceanO != null) {
    const oceanDescriptions = {
      O: user.oceanO >= 4 ? 'creative, curious, open to trying new techniques' : user.oceanO <= 2 ? 'prefers familiar, proven routines — introduce changes gradually' : 'moderately open to new ideas',
      C: user.oceanC >= 4 ? 'highly disciplined, structure-driven, goal-focused — give clear step-by-step plans' : user.oceanC <= 2 ? 'flexible but may struggle with consistency — short habit loops work better' : 'moderately conscientious',
      E: user.oceanE >= 4 ? 'energised by team & crowd, motivated by recognition — use social/team framing' : user.oceanE <= 2 ? 'introverted, prefers internal motivation — quiet focus strategies work best' : 'moderately extraverted',
      A: user.oceanA >= 4 ? 'team-oriented, receptive to feedback — responds well to collaborative coaching' : user.oceanA <= 2 ? 'independent-minded — frame advice as their own idea where possible' : 'moderately agreeable',
      N: user.oceanN >= 4 ? 'higher anxiety tendency — prioritise calming and grounding before performance advice' : user.oceanN <= 2 ? 'emotionally stable under pressure — can push harder, less hand-holding needed' : 'moderate emotional reactivity',
    };
    oceanSection = `## Personality Profile (Big Five / OCEAN)
- Openness: ${user.oceanO}/5 — ${oceanDescriptions.O}
- Conscientiousness: ${user.oceanC}/5 — ${oceanDescriptions.C}
- Extraversion: ${user.oceanE}/5 — ${oceanDescriptions.E}
- Agreeableness: ${user.oceanA}/5 — ${oceanDescriptions.A}
- Neuroticism: ${user.oceanN}/5 — ${oceanDescriptions.N}
Adapt ALL advice and coaching style to match this personality. High N = calm first, then advise. Low E = avoid "talk to teammates" advice. High C = give structured 3-step plans.

## Profile Active Use
This profile is re-fetched on every message — treat it as live truth, not a fixed snapshot.
Shape HOW you respond (framing, tone, structure), not just WHAT you say:
- High O (4–5): exploratory, reflective framing; introduce new mental frameworks
- High C (4–5): structured, step-by-step plans; measurable commitments
- High E (4–5): social/crowd framing; team energy angles
- Low E (1–2): internal strategies only; never "talk to your teammates"
- High N (4–5): calm and ground FIRST — never add to anxiety
- Low N (1–2): can challenge more directly; less hand-holding needed
- High A (4–5): "we" framing; collaborative tone
- Low A (1–2): frame advice as their own idea; independent-minded approach
Do NOT mention that you are reading a profile — let it silently shape your response.`;
  }

  const sessionSection = sessionType && SESSION_INSTRUCTIONS[sessionType]
    ? `## Active Session\n${SESSION_INSTRUCTIONS[sessionType]}\n\nFor this session: Ask ONE focused question at a time. Do not give advice, techniques, or solutions until you fully understand the athlete's situation.`
    : '';

  const extraSections = [patternSection, oceanSection].filter(Boolean).join('\n\n');

  const actionBridgeSection = (extra.arjunMsgCount ?? 0) >= 4
    ? `\n\n## Natural Action Offer\nYou are ${extra.arjunMsgCount} responses into this session. If you feel you have addressed the athlete's main concern, naturally offer ONE specific next step they can try right now — for example a 2-minute breathing exercise, building a pre-match routine together, or a quick visualisation drill. Keep it to one casual sentence such as "Want to try a quick breathing exercise right now?" Only offer this once — if you have already suggested a next action in this session, do not repeat it.`
    : '';

  const styleSection = replyStyle && STYLE_INSTRUCTIONS[replyStyle]
    ? `\n\n## Response Style\nThe user has selected "${replyStyle}" mode. ${STYLE_INSTRUCTIONS[replyStyle]}`
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

  const toolAwarenessSection = `\n\n## In-App Tools (recommend via [APP:] tag)
When it's genuinely useful, recommend ONE specific in-app tool at the very END of your message using this exact format on its own line: [APP: tool_key]
Available tool keys and when to use them:
- breathing → athlete is nervous, anxious, overwhelmed, or can't settle before a match
- reset → needs a pressure reset flow, feeling overwhelmed before a big moment
- ritual → wants to build a match-day routine or pre-match process
- debrief → just had a match, wants to process a result or reflect on what went well
- games → wants to improve focus, attention, or mental sharpness through practice
Only include [APP: tool_key] when the conversation genuinely points to that tool — not every message. Max ONE per message. Do NOT mention the tool in your text — let the tag do the work silently. The UI will display a "Try it now" button for the athlete.`;

  return `You are Arjun — a mental performance coach who specialises in sports psychology for Indian athletes. You are warm, direct, and feel like a trusted older brother who truly understands the pressures of Indian sports culture.${mfsSection}

## Athlete Profile
- **Name:** ${user.name}
- **Sport:** ${user.sport ? user.sport.charAt(0).toUpperCase() + user.sport.slice(1) : 'Not specified'}
- **Age:** ${user.age ? `${user.age} years` : 'Not specified'}
- **Experience level:** ${user.experienceLevel || 'Not specified'}
- **Competition level:** ${user.competitionLevel || 'Not specified'}
- **Biggest mental challenge:** ${CHALLENGE_LABELS[user.primaryChallenge] || user.primaryChallenge || 'Not specified'}
- **Current coping style:** ${PRESSURE_LABELS[user.pressureResponse] || user.pressureResponse || 'Not specified'}
- **Focus areas:** ${goalsText}

## Coaching Style
- Be warm, direct, and encouraging — a trusted coach, not a therapist
- Keep replies **short and scannable**: 2–3 sentences maximum per response. No walls of text. Break into short paragraphs if needed.
- Ask **at most ONE follow-up question** per reply — never stack multiple questions in the same message.
- Maintain a warm, direct coach tone — conversational, not clinical — across all session types.
- Use evidence-based techniques: visualisation, self-talk, breathing regulation, process goals, confidence routines
- Acknowledge Indian sports realities: family pressure, limited mental health awareness, academic-sports balance, financial constraints
- Use the athlete's name occasionally to personalise the conversation
- End most responses with one concrete, actionable step or a 2-minute mental exercise
- If today's check-in scores are available (see "TODAY's scores" in the mental state section), reference specific numbers early in the conversation — never ignore a score of 3 or below (e.g. "I see your confidence is at 2/5 today — what's been going on?")
- Always end your message with a new line: [SUGGEST: option1 | option2 | option3] containing 2–3 short follow-up suggestions (3–6 words each). For limited-choice questions the options are the likely answers; for open-ended replies they are natural next directions the athlete might want to explore. Max 3 options.

## Boundaries
- You are a performance coach, not a doctor or clinical therapist
- For serious mental health concerns (depression, anxiety disorders, trauma), warmly suggest professional help while still being supportive
- Stay focused on sport performance, mindset, and mental skills
- Never diagnose conditions or suggest medications

## Language
${langInstruction}

${sessionSection ? sessionSection + '\n\n' : ''}${checkInSection}

${activitySection}${debriefSection ? '\n\n' + debriefSection : ''}

${memorySection}${extraSections ? '\n\n' + extraSections : ''}${actionBridgeSection}${styleSection}${toolAwarenessSection}`;
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

router.post('/message', authenticate, checkFreeLimit, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI coaching is not configured. Add ANTHROPIC_API_KEY to your server .env file.',
    });
  }

  const { content, sessionType = null, arjunMsgCount = 0, replyStyle = null, chatSessionId = null, arjunReport = null } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const isSessionStart = content.startsWith('__SESSION:');

  if (!isSessionStart && content.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
  }

  try {
    // Fetch user profile for the system prompt (including OCEAN + age + all onboarding fields)
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        name: true, sport: true, experienceLevel: true, goals: true, language: true,
        competitionLevel: true, primaryChallenge: true, pressureResponse: true,
        ritualName: true, ritualSteps: true, xp: true, age: true,
        oceanO: true, oceanC: true, oceanE: true, oceanA: true, oceanN: true,
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
        match_prep: 'an upcoming match',
        post_match: 'a recent match result',
        build_focus: 'improving focus and concentration',
        confidence: 'building confidence',
        handle_pressure: 'handling pressure',
        open: 'an open coaching conversation',
        post_checkin:    'my daily check-in results and how I\'m doing today',
        pressure_reset:  'a high-pressure moment before my match',
        setback_reset:   'processing a tough game or setback',
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
    let fullText = '';

    const stream = anthropic.messages.stream({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: buildSystemPrompt(user, recentCheckIns, memories, sessionType, { recentDebriefs, todayDrill, achievementCount, recentDrills, gameSessions, ritual, arjunMsgCount, replyStyle, mfsEntry, mfsHistory, mfsReport: arjunReport }),
      messages: conversationHistory,
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ t: 'd', c: text })}\n\n`);
    });

    await stream.finalMessage();

    // Save the complete assistant response
    const assistantMsg = await prisma.message.create({
      data: { userId: req.userId, role: 'assistant', content: fullText, sessionType: sessionType || null, chatSessionId: chatSessionId || null },
    });

    res.write(`data: ${JSON.stringify({ t: 'end', id: assistantMsg.id })}\n\n`);
    res.end();

    // Run memory extraction in background — don't await
    extractAndStoreMemories(req.userId, conversationHistory, fullText).catch(() => {});

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
// Single non-streaming call used by the guided wizard flows.
// Returns { text: string, cueWord: string|null }

router.post('/wizard', authenticate, async (req, res) => {
  const { wizardType, feeling, situation, language = 'en', whatHappened, intensity, stuckOn, intensityLabel, controlChoice } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { sport: true, oceanO: true, oceanC: true, oceanE: true, oceanA: true, oceanN: true, ritualSteps: true, language: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Extract cue word from ritual steps (type === 'cue')
    let cueWord = null;
    try {
      const steps = JSON.parse(user.ritualSteps || '[]');
      const cueStep = steps.find(s => s.type === 'cue');
      if (cueStep?.label) cueWord = cueStep.label;
    } catch {}

    const lang = user.language || language;
    const sport = user.sport || 'sport';
    const langNote = lang === 'hi' ? ' Respond in Hindi.' : '';

    let systemPrompt, maxTokens;
    if (wizardType === 'pressure_reset') {
      systemPrompt = `You are Arjun, a mental performance coach. In 1–2 sentences maximum, reframe the athlete's feeling as a sign of readiness, not weakness. Be direct and warm. No lists. No questions. Feeling: ${feeling}. Sport: ${sport}.${langNote} Output only the reframe text.`;
      maxTokens = 80;
    } else if (wizardType === 'setback_reset') {
      systemPrompt = `You are Arjun, a mental performance coach. In 2–3 sentences maximum: first fully acknowledge what happened and validate the feeling (do NOT rush to positivity or silver linings), then name ONE specific thing in the athlete's control next time. Be warm, direct, real. No lists. No questions. Situation: ${situation}. Feeling: ${feeling}. Sport: ${sport}.${langNote} Output only the response text.`;
      maxTokens = 120;
    } else if (wizardType === 'bounce_back') {
      const intensityNum = parseInt(intensity) || 3;
      const intDesc = intensityLabel || ['Manageable', 'Irritated', 'Heavy', 'Very intense', 'Losing control'][intensityNum - 1] || 'Heavy';
      const oceanN = user.oceanN ?? 3;
      const oceanO = user.oceanO ?? 3;
      const pressureCtx = oceanN >= 4
        ? 'This athlete is emotionally sensitive — they need full acknowledgment before any forward focus. Do not rush them.'
        : oceanN <= 2
        ? 'This athlete is resilient — they can handle a direct challenge and move forward quickly.'
        : '';
      const openCtx = oceanO >= 4 ? 'They respond well to reframing and new angles.' : '';
      systemPrompt = `You are Arjun, a mental performance coach for Indian athletes aged 14–25.

An athlete just used the Bounce Back tool. Here is what they shared:
• What happened: "${situation || 'a bad game'}"
• Mind stuck on: "${stuckOn || 'the moment'}"
• Intensity: ${intensityNum}/5 — "${intDesc}"
• One thing they will control next: "${controlChoice || 'their next action'}"
• Sport: ${sport}
${pressureCtx} ${openCtx}

Write a short coaching response in this exact structure (as flowing prose, no labels or numbers):
1. Name their pain directly — acknowledge it was hard. No fluff.
2. Separate the mistake from their identity. Use language like: "Mistake ko data bana, identity mat bana" or "One bad moment is not your level."
3. Give one specific useful lesson from THIS exact situation.
4. Give one immediate action — concrete, doable in the next 10 minutes.
5. End with a 3–5 word cue phrase they can repeat.

Rules:
- Under 80 words total
- NEVER say: "you've got this", "stay positive", "everything happens for a reason", "be kind to yourself", "I understand how you feel"
- No therapy language, no clinical terms, no toxic positivity
- Tone: strong, calm, direct — Indian performance coach talking to a 14–17 year old athlete
- ${lang === 'hi' ? 'Write in Hinglish (natural Hindi-English mix — conversational, not formal Hindi).' : 'Write in English. You may use 1–2 natural Hinglish phrases.'}
- Address the athlete directly as "you" or "tu" (match the language register)
- Output only the coaching response — no labels, no numbers, no prefix`;
      maxTokens = 160;
    } else if (wizardType === 'cue_word') {
      const { arousal, firstFocus } = req.body;
      const arousalDesc = {
        calm_down: 'calming down — they are nervous or anxious',
        lock_in:   'locking in focus — they are distracted or scattered',
        fire_up:   'firing up — they are flat or low on energy',
      }[arousal] || 'getting ready';
      systemPrompt = `You are Arjun, a mental performance coach. Generate exactly 5 short power words for an athlete who needs to focus on ${arousalDesc} before their ${sport} match. Their chosen match focus: "${firstFocus || 'performing well'}". Rules: Each word must be 1–2 words MAX, ALL CAPS, short and punchy (e.g. SHARP, READY, HERE, LOCK, TRUST). Output a valid JSON array only — exactly like this example: ["SHARP","READY","HERE","LOCK","TRUST"]. No other text, no explanation.`;
      maxTokens = 60;
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

    // For cue_word: parse the JSON array response
    if (wizardType === 'cue_word') {
      try {
        const raw = message.content[0].text.trim();
        const words = JSON.parse(raw);
        if (Array.isArray(words)) {
          return res.json({ words: words.slice(0, 5) });
        }
      } catch {}
      // Fallback if parse fails
      return res.json({ words: ['SHARP', 'READY', 'HERE', 'LOCK', 'TRUST'] });
    }

    let xpEarned = null, xpTotal = null;
    if (wizardType === 'bounce_back') {
      const BOUNCE_XP = 15;
      await prisma.user.update({ where: { id: req.userId }, data: { xp: { increment: BOUNCE_XP } } });
      const updated = await prisma.user.findUnique({ where: { id: req.userId }, select: { xp: true } });
      xpEarned = BOUNCE_XP;
      xpTotal = updated.xp;
    }

    res.json({ text: message.content[0].text, cueWord, xpEarned, xp: xpTotal });
  } catch (err) {
    console.error('wizard error:', err);
    res.status(500).json({ error: 'Wizard call failed' });
  }
});

module.exports = router;
