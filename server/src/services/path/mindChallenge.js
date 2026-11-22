// Mind Challenge — levels from round points, plus the store
// (docs/PATH-STRATEGY.md). Skills are the same keys as the path chapters.
const { CHAPTERS } = require('./pathConfig');

const SKILLS = CHAPTERS; // calm, focus, confidence, routine, bounce, picture
const MAX_POINTS = 6;     // two answers (or answer + mini-game) worth 0–3 each
const REMATCH_DAYS = 28;
const NEXT_MATCH = new Set(['this_week', 'next_week', 'not_sure']);

// 0–6 points → Level 1–5.
function levelFromPoints(p) {
  const n = Math.max(0, Math.min(MAX_POINTS, Math.round(Number(p) || 0)));
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 3;
  if (n === 5) return 4;
  return 5;
}

// Validates { calm: 0–6, ... } for every skill; returns null if invalid.
function cleanPoints(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  for (const s of SKILLS) {
    const v = input[s];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_POINTS) return null;
    out[s] = Math.round(v);
  }
  return out;
}

function scoreChallenge(points) {
  const levels = Object.fromEntries(SKILLS.map(s => [s, levelFromPoints(points[s])]));
  const mindLevel = Math.max(1, Math.round(SKILLS.reduce((a, s) => a + levels[s], 0) / SKILLS.length));
  // Strongest and the one to grow first (lowest; ties keep the path order).
  const strongest = SKILLS.reduce((best, s) => (levels[s] > levels[best] ? s : best), SKILLS[0]);
  const growFirst = SKILLS.reduce((low, s) => (levels[s] < levels[low] ? s : low), SKILLS[0]);
  return { levels, mindLevel, strongest, growFirst };
}

function summary(row) {
  if (!row) return null;
  const { strongest, growFirst } = scoreChallenge(row.points);
  return {
    id: row.id, levels: row.levels, mindLevel: row.mindLevel, strongest, growFirst,
    focusSkill: row.focusSkill || null, nextMatch: row.nextMatch || null, createdAt: row.createdAt,
  };
}

function nextAvailableAt(latest) {
  if (!latest) return null;
  return new Date(new Date(latest.createdAt).getTime() + REMATCH_DAYS * 86400000);
}

function createMindChallengeStore(prisma) {
  async function state(userId, now = new Date()) {
    const rows = await prisma.mindChallengeResult.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 2 });
    const [latest, previous] = rows;
    const nextAt = nextAvailableAt(latest);
    return {
      latest: summary(latest),
      previous: summary(previous),
      nextAt,
      canTake: !latest || now >= nextAt,
    };
  }

  async function save(userId, points) {
    const { levels, mindLevel } = scoreChallenge(points);
    await prisma.mindChallengeResult.create({ data: { userId, points, levels, mindLevel } });
    return state(userId);
  }

  async function setGoal(userId, { focusSkill, nextMatch }) {
    const latest = await prisma.mindChallengeResult.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (!latest) return null;
    await prisma.mindChallengeResult.update({ where: { id: latest.id }, data: { focusSkill, nextMatch } });
    return state(userId);
  }

  return { state, save, setGoal };
}

module.exports = { SKILLS, MAX_POINTS, REMATCH_DAYS, NEXT_MATCH, levelFromPoints, cleanPoints, scoreChallenge, nextAvailableAt, createMindChallengeStore };
