// Learning path — pure rules (buildPath / stepsToRecord) plus a Prisma-backed
// store. The path never deletes anything and never blocks any feature: it
// only reads what the athlete did and records finished steps.

const { CHAPTERS, STEPS, LEVELS, PRACTISE_TOOL_TYPES, chapterOrderFor, levelKey, parseLevelKey } = require('./pathConfig');

function validOrder(order) {
  const list = Array.isArray(order) ? order.filter(k => CHAPTERS.includes(k)) : [];
  const unique = [...new Set(list)];
  // Any chapter added later is appended, so old paths stay valid.
  return [...unique, ...CHAPTERS.filter(c => !unique.includes(c))];
}

// steps: [{ chapterKey, stepKey, outcome, doneAt }] — chapterKey may carry a
// level ("focus:2"). → { chapters: [{ key, status, steps, doneCount, levels,
// level }], currentKey, finished, next: { chapterKey, stepKey, level } }
// The chapter-level fields (status, steps, doneCount) describe Level 1, as
// before: the next chapter opens when Level 1 is done. Levels 2 and 3 open one
// after another once the level before is done.
function stepState(done) {
  return Object.fromEntries(STEPS.map(st => [st, {
    done: !!done[st], outcome: done[st]?.outcome || null, at: done[st]?.doneAt || null,
  }]));
}

function buildPath({ order, steps }) {
  const keys = validOrder(order);
  const byLevel = {};
  for (const s of steps || []) {
    if (!STEPS.includes(s.stepKey)) continue;
    const parsed = parseLevelKey(s.chapterKey);
    if (!parsed) continue;
    ((byLevel[parsed.chapterKey] ||= {})[parsed.level] ||= {})[s.stepKey] = s;
  }
  let currentKey = null;
  const chapters = keys.map(key => {
    const levels = [];
    for (const level of LEVELS) {
      const done = byLevel[key]?.[level] || {};
      const doneCount = STEPS.filter(st => done[st]).length;
      let status;
      if (doneCount === STEPS.length) status = 'done';
      else if (level === 1) status = currentKey ? 'locked' : 'current';
      else status = levels[level - 2].status === 'done' ? 'current' : 'locked';
      levels.push({ level, status, steps: stepState(done), doneCount });
    }
    const first = levels[0];
    if (first.status === 'current') currentKey = key;
    const open = levels.find(l => l.status === 'current');
    return {
      key, status: first.status, steps: first.steps, doneCount: first.doneCount,
      levels,
      // The level the athlete is on in this chapter (3 when all are done).
      level: open ? open.level : (first.status === 'locked' ? 1 : LEVELS[LEVELS.length - 1]),
      mastered: levels.every(l => l.status === 'done'),
    };
  });
  let next = null;
  const current = chapters.find(c => c.key === currentKey);
  if (current) {
    next = { chapterKey: currentKey, stepKey: STEPS.find(st => !current.steps[st].done), level: 1 };
  } else {
    // Every chapter's Level 1 is done: carry on with the first open level.
    for (const c of chapters) {
      const open = c.levels.find(l => l.level > 1 && l.status === 'current');
      if (open) { next = { chapterKey: c.key, stepKey: STEPS.find(st => !open.steps[st].done), level: open.level }; break; }
    }
  }
  return {
    chapters,
    currentKey,
    finished: !currentKey,
    allMastered: chapters.every(c => c.mastered),
    next,
  };
}

// Steps the athlete has earned through their activity but that are not yet
// recorded — only for the CURRENT chapter, so the path moves one chapter at a
// time. evidence: { toolTypes: [{ toolType, at }], routineChangedAt: Date|null,
// journalAt: Date[] } — all from after the path started.
function stepsToRecord(path, evidence) {
  const out = [];
  const earn = (chapterKey, level, steps, since) => {
    const key = levelKey(chapterKey, level);
    if (!steps.practise.done) {
      const types = PRACTISE_TOOL_TYPES[chapterKey] || [];
      const after = (at) => !since || new Date(at) > new Date(since);
      const hit = (evidence.toolTypes || []).find(t => types.includes(t.toolType) && after(t.at));
      const routineHit = chapterKey === 'routine' && evidence.routineChangedAt && after(evidence.routineChangedAt);
      if (hit || routineHit) out.push({ chapterKey: key, stepKey: 'practise', doneAt: hit ? hit.at : evidence.routineChangedAt });
    }
    // Reflect: a Mind Journal entry written after the athlete used it in play.
    const play = steps.play;
    if (play.done && !steps.reflect.done) {
      const after = (evidence.journalAt || []).find(at => new Date(at) > new Date(play.at));
      if (after) out.push({ chapterKey: key, stepKey: 'reflect', doneAt: after });
    }
  };
  // Level 1: only the CURRENT chapter, so the path moves one chapter at a time.
  const current = path.chapters.find(c => c.status === 'current');
  if (current) earn(current.key, 1, current.steps, null);
  // Levels 2–3: an open level counts practice done after its lesson was read,
  // so a new level is never ticked by something done before it.
  for (const c of path.chapters) {
    for (const l of c.levels || []) {
      if (l.level > 1 && l.status === 'current' && l.steps.learn.done) earn(c.key, l.level, l.steps, l.steps.learn.at);
    }
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

const { loadPersonal } = require('./personal');

function matchOf(progress) {
  return {
    nextDay: progress?.nextMatchDay || null,
    type: progress?.nextMatchDay ? (progress?.nextMatchType || null) : null,
    lastDay: progress?.lastMatchDay || null,
    lastFeel: progress?.lastMatchFeel || null,
  };
}

function planOf(progress) {
  const p = progress?.playPlan;
  return p && typeof p === 'object' && p.tool && p.moment ? p : null;
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
    return { ...path, match: matchOf(progress), plan: planOf(progress), personal: await loadPersonal(prisma, userId) };
  }

  // Next match (Hook fix 2): set or clear the day.
  async function setMatch(userId, day, type = null) {
    await ensureProgress(userId);
    await prisma.pathProgress.update({ where: { userId }, data: { nextMatchDay: day || null, nextMatchType: day ? (type || null) : null } });
  }

  // Play plan (Hook fix 3): set or clear the if–then plan.
  async function setPlan(userId, plan) {
    await ensureProgress(userId);
    await prisma.pathProgress.update({
      where: { userId },
      data: { playPlan: plan ? { ...plan, at: new Date().toISOString() } : null },
    });
  }

  // "How did it go?": remember the answer, clear the match, and when the
  // athlete used the chapter's skill, tick the path's Play step.
  async function reviewMatch(userId, { feel = null, used = null, chapterKey = null }) {
    const progress = await ensureProgress(userId);
    await prisma.pathProgress.update({
      where: { userId },
      data: { lastMatchDay: progress.nextMatchDay || null, lastMatchFeel: feel, nextMatchDay: null, nextMatchType: null, playPlan: null },
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

  return { getPath, record, ensureProgress, prioritise, setMatch, reviewMatch, setPlan };
}

module.exports = { levelKey, buildPath, stepsToRecord, validOrder, reorderForGoal, createPathStore };
