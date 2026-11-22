// Learning path — pure rules (buildPath / stepsToRecord) plus a Prisma-backed
// store. The path never deletes anything and never blocks any feature: it
// only reads what the athlete did and records finished steps.

const { CHAPTERS, STEPS, PRACTISE_TOOL_TYPES, chapterOrderFor } = require('./pathConfig');

function validOrder(order) {
  const list = Array.isArray(order) ? order.filter(k => CHAPTERS.includes(k)) : [];
  const unique = [...new Set(list)];
  // Any chapter added later is appended, so old paths stay valid.
  return [...unique, ...CHAPTERS.filter(c => !unique.includes(c))];
}

// steps: [{ chapterKey, stepKey, outcome, doneAt }]
// → { chapters: [{ key, status, steps: { learn: {done, outcome, at}, ... }, doneCount }], currentKey, next }
function buildPath({ order, steps }) {
  const keys = validOrder(order);
  const byChapter = {};
  for (const s of steps || []) {
    if (!STEPS.includes(s.stepKey)) continue;
    (byChapter[s.chapterKey] ||= {})[s.stepKey] = s;
  }
  let currentKey = null;
  const chapters = keys.map(key => {
    const done = byChapter[key] || {};
    const stepState = Object.fromEntries(STEPS.map(st => [st, {
      done: !!done[st], outcome: done[st]?.outcome || null, at: done[st]?.doneAt || null,
    }]));
    const doneCount = STEPS.filter(st => done[st]).length;
    let status;
    if (doneCount === STEPS.length) status = 'done';
    else if (!currentKey) { status = 'current'; currentKey = key; }
    else status = 'locked';
    return { key, status, steps: stepState, doneCount };
  });
  const current = chapters.find(c => c.key === currentKey);
  const nextStep = current ? STEPS.find(st => !current.steps[st].done) : null;
  return {
    chapters,
    currentKey,
    finished: !currentKey,
    next: current ? { chapterKey: currentKey, stepKey: nextStep } : null,
  };
}

// Steps the athlete has earned through their activity but that are not yet
// recorded — only for the CURRENT chapter, so the path moves one chapter at a
// time. evidence: { toolTypes: [{ toolType, at }], routineChangedAt: Date|null,
// journalAt: Date[] } — all from after the path started.
function stepsToRecord(path, evidence) {
  const current = path.chapters.find(c => c.status === 'current');
  if (!current) return [];
  const out = [];
  if (!current.steps.practise.done) {
    const types = PRACTISE_TOOL_TYPES[current.key] || [];
    const hit = (evidence.toolTypes || []).find(t => types.includes(t.toolType));
    const routineHit = current.key === 'routine' && evidence.routineChangedAt;
    if (hit || routineHit) out.push({ chapterKey: current.key, stepKey: 'practise', doneAt: hit ? hit.at : evidence.routineChangedAt });
  }
  // Reflect: a Mind Journal entry written after the athlete used it in play.
  const play = current.steps.play;
  if (play.done && !current.steps.reflect.done) {
    const after = (evidence.journalAt || []).find(at => new Date(at) > new Date(play.at));
    if (after) out.push({ chapterKey: current.key, stepKey: 'reflect', doneAt: after });
  }
  return out;
}

// Moves `chapterKey` to be the next chapter the athlete works on: first if
// nothing has been started, otherwise right after the current chapter. Done
// and current chapters never move.
function reorderForGoal(order, steps, chapterKey) {
  const path = buildPath({ order, steps });
  const keys = path.chapters.map(c => c.key);
  const target = path.chapters.find(c => c.key === chapterKey);
  if (!target || target.status !== 'locked') return keys;
  const started = (steps || []).length > 0;
  const rest = keys.filter(k => k !== chapterKey);
  if (!started) return [chapterKey, ...rest];
  const at = rest.indexOf(path.currentKey) + 1;
  return [...rest.slice(0, at), chapterKey, ...rest.slice(at)];
}

function matchOf(progress) {
  return {
    nextDay: progress?.nextMatchDay || null,
    lastDay: progress?.lastMatchDay || null,
    lastFeel: progress?.lastMatchFeel || null,
  };
}

function createPathStore(prisma) {
  async function priorityFor(userId) {
    const profile = await prisma.startingPerformanceProfile.findFirst({
      where: { userId }, orderBy: { updatedAt: 'desc' },
      select: { agreedPriorityId: true, suggestedPriorityId: true },
    });
    return profile?.agreedPriorityId || profile?.suggestedPriorityId || null;
  }

  async function ensureProgress(userId) {
    const existing = await prisma.pathProgress.findUnique({ where: { userId } });
    if (existing) return existing;
    const order = chapterOrderFor(await priorityFor(userId));
    try {
      return await prisma.pathProgress.create({ data: { userId, order } });
    } catch (err) {
      if (err?.code === 'P2002') return prisma.pathProgress.findUnique({ where: { userId } });
      throw err;
    }
  }

  async function loadSteps(userId) {
    return prisma.pathStep.findMany({ where: { userId }, select: { chapterKey: true, stepKey: true, outcome: true, doneAt: true } });
  }

  async function evidenceSince(userId, since) {
    const [reports, routine, journal] = await Promise.all([
      prisma.toolReport.findMany({ where: { userId, createdAt: { gte: since } }, select: { toolType: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
      prisma.routine.findFirst({ where: { userId, updatedAt: { gte: since } }, select: { updatedAt: true }, orderBy: { updatedAt: 'asc' } }),
      prisma.mindJournalEntry.findMany({ where: { userId, createdAt: { gte: since } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      toolTypes: reports.map(r => ({ toolType: r.toolType, at: r.createdAt })),
      routineChangedAt: routine?.updatedAt || null,
      journalAt: journal.map(j => j.createdAt),
    };
  }

  async function record(userId, { chapterKey, stepKey, outcome = null, doneAt }) {
    await prisma.pathStep.upsert({
      where: { userId_chapterKey_stepKey: { userId, chapterKey, stepKey } },
      update: outcome ? { outcome } : {},
      create: { userId, chapterKey, stepKey, outcome, ...(doneAt ? { doneAt: new Date(doneAt) } : {}) },
    });
  }

  async function getPath(userId) {
    const progress = await ensureProgress(userId);
    let steps = await loadSteps(userId);
    let path = buildPath({ order: progress.order, steps });
    const evidence = await evidenceSince(userId, progress.startedAt);
    // Up to two passes: practise can unlock nothing else, reflect can finish a chapter.
    for (let i = 0; i < 2; i += 1) {
      const earned = stepsToRecord(path, evidence);
      if (!earned.length) break;
      for (const s of earned) await record(userId, s);
      steps = await loadSteps(userId);
      path = buildPath({ order: progress.order, steps });
    }
    return { ...path, match: matchOf(progress) };
  }

  // Next match (Hook fix 2): set or clear the day.
  async function setMatch(userId, day) {
    await ensureProgress(userId);
    await prisma.pathProgress.update({ where: { userId }, data: { nextMatchDay: day || null } });
  }

  // "How did it go?": remember the answer, clear the match, and when the
  // athlete used the chapter's skill, tick the path's Play step.
  async function reviewMatch(userId, { feel = null, used = null, chapterKey = null }) {
    const progress = await ensureProgress(userId);
    await prisma.pathProgress.update({
      where: { userId },
      data: { lastMatchDay: progress.nextMatchDay || null, lastMatchFeel: feel, nextMatchDay: null },
    });
    if (chapterKey && (used === 'helped' || used === 'tried')) {
      await record(userId, { chapterKey, stepKey: 'play', outcome: used });
    }
  }

  async function prioritise(userId, chapterKey) {
    const progress = await ensureProgress(userId);
    const steps = await loadSteps(userId);
    const order = reorderForGoal(progress.order, steps, chapterKey);
    await prisma.pathProgress.update({ where: { userId }, data: { order } });
  }

  return { getPath, record, ensureProgress, prioritise, setMatch, reviewMatch };
}

module.exports = { buildPath, stepsToRecord, validOrder, reorderForGoal, createPathStore };
