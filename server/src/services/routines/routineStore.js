// Ritual rebuild (PR 1) — every routine write, in one place.
//
// Concurrency: each write runs in an interactive transaction that first
// takes a row lock on the athlete's own User row (SELECT … FOR UPDATE). Two
// requests for the same athlete therefore run one after the other, which is
// what makes the 5-routine limit, the one-time legacy import and the legacy
// mirror hold under concurrent requests. Different athletes never block each
// other. RitualLegacyImport.userId is additionally UNIQUE in the database,
// so even a path that somehow skipped the lock could not import twice.
//
// Legacy ritual (User.ritualName / User.ritualSteps):
//  - Before import, the legacy fields are the only copy and nothing here
//    touches them except a legacy save (unchanged behaviour).
//  - importLegacy() copies them once into a Routine and records a
//    RitualLegacyImport row (status "linked"). From then on the Routine is
//    authoritative and the legacy fields are its mirror: editing the routine
//    rewrites the mirror, and a save from a cached legacy client is applied
//    to both in the same transaction, so the two copies never diverge.
//  - Deleting the imported routine clears the legacy fields in the same
//    transaction (so Coach, which reads them, stops receiving it) and marks
//    the import row "deleted" so import never recreates it.
//  - A later legacy save is a new, deliberate athlete save: it writes the
//    legacy fields as before and removes the "deleted" marker, so that new
//    content can be imported explicitly. Nothing deleted is ever restored —
//    the deleted content was cleared when it was deleted.
//
// `client` is injectable (same pattern as the other route factories) so the
// route can be exercised against an in-memory fake or an isolated database.

const { PrismaClient } = require('@prisma/client');
const { LIMITS } = require('./validateRoutine');
const { screenSafetyFields } = require('../safety');
const {
  collectLegacyRitualText, parseLegacySteps, legacyToRoutineSteps, routineStepsToLegacy, mergeLegacyIntoRoutineSteps,
} = require('./legacyRitual');

const TX_OPTIONS = { maxWait: 5000, timeout: 10000 };

class RoutineError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function serializeRoutine(routine, link) {
  return {
    id: routine.id,
    name: routine.name ?? null,
    category: routine.category,
    sport: routine.sport ?? null,
    role: routine.role ?? null,
    moment: routine.moment ?? null,
    startTrigger: routine.startTrigger ?? null,
    existingHabits: routine.existingHabits ?? [],
    purpose: routine.purpose ?? null,
    steps: Array.isArray(routine.steps) ? routine.steps : [],
    sourceRoutineId: routine.sourceRoutineId ?? null,
    templateKey: routine.templateKey ?? null,
    templateVersion: routine.templateVersion ?? null,
    isLegacyImport: !!(link && link.status === 'linked' && link.routineId === routine.id),
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  };
}

function legacyMirror(routine) {
  return {
    ritualName: routine.name ?? null,
    ritualSteps: JSON.stringify(routineStepsToLegacy(routine.steps)),
  };
}

const CLEARED_LEGACY = { ritualName: null, ritualSteps: '[]' };

function createRoutineStore(client = new PrismaClient()) {
  // Locks the athlete's User row for the rest of the transaction and returns
  // the profile fields the writes need. A missing user (e.g. deleted
  // mid-request) is a not_found, never a write.
  async function lockUser(tx, userId) {
    const rows = await tx.$queryRaw`SELECT "id", "sport", "position", "ritualName", "ritualSteps" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!rows || rows.length === 0) throw new RoutineError('not_found');
    return rows[0];
  }

  function transaction(fn) {
    return client.$transaction(fn, TX_OPTIONS);
  }

  // ── Reads (never write anything) ──────────────────────────────────────
  async function list(userId) {
    const [routines, link, user] = await Promise.all([
      client.routine.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      client.ritualLegacyImport.findUnique({ where: { userId } }),
      client.user.findUnique({ where: { id: userId }, select: { ritualSteps: true } }),
    ]);
    const legacyAvailable = !link && parseLegacySteps(user?.ritualSteps).length > 0;
    return {
      routines: routines.map(r => serializeRoutine(r, link)),
      limit: LIMITS.MAX_ACTIVE_ROUTINES,
      legacy: {
        status: link ? link.status : (legacyAvailable ? 'available' : 'none'),
        routineId: link?.routineId ?? null,
      },
    };
  }

  async function get(userId, id) {
    const routine = await client.routine.findFirst({ where: { id, userId } });
    if (!routine) throw new RoutineError('not_found');
    const link = await client.ritualLegacyImport.findUnique({ where: { userId } });
    return serializeRoutine(routine, link);
  }

  // ── Writes ────────────────────────────────────────────────────────────
  async function create(userId, data) {
    return transaction(async (tx) => {
      const user = await lockUser(tx, userId);
      const count = await tx.routine.count({ where: { userId } });
      if (count >= LIMITS.MAX_ACTIVE_ROUTINES) throw new RoutineError('routine_limit_reached');

      if (data.sourceRoutineId) {
        // Ownership check inside the locked transaction: a source that is
        // missing or belongs to someone else looks identical (no probing).
        const source = await tx.routine.findFirst({ where: { id: data.sourceRoutineId, userId }, select: { id: true } });
        if (!source) throw new RoutineError('source_not_found');
      }

      const routine = await tx.routine.create({
        data: {
          userId,
          name: data.name,
          category: data.category,
          // Sport is a snapshot of the profile unless the client sent one.
          sport: data.sport !== undefined ? data.sport : (user.sport || null),
          role: data.role ?? null,
          moment: data.moment ?? null,
          startTrigger: data.startTrigger ?? null,
          existingHabits: data.existingHabits ?? [],
          purpose: data.purpose ?? null,
          steps: data.steps,
          sourceRoutineId: data.sourceRoutineId ?? null,
          templateKey: data.templateKey ?? null,
          templateVersion: data.templateVersion ?? null,
        },
      });
      return serializeRoutine(routine, null);
    });
  }

  async function update(userId, id, patch) {
    return transaction(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.routine.findFirst({ where: { id, userId }, select: { id: true } });
      if (!existing) throw new RoutineError('not_found');

      const routine = await tx.routine.update({ where: { id }, data: patch });
      const link = await tx.ritualLegacyImport.findUnique({ where: { userId } });
      if (link && link.status === 'linked' && link.routineId === id) {
        await tx.user.update({ where: { id: userId }, data: legacyMirror(routine) });
      }
      return serializeRoutine(routine, link);
    });
  }

  async function remove(userId, id) {
    return transaction(async (tx) => {
      await lockUser(tx, userId);
      const existing = await tx.routine.findFirst({ where: { id, userId }, select: { id: true } });
      if (!existing) throw new RoutineError('not_found');

      const link = await tx.ritualLegacyImport.findUnique({ where: { userId } });
      const wasLegacy = !!(link && link.status === 'linked' && link.routineId === id);
      if (wasLegacy) {
        await tx.ritualLegacyImport.update({
          where: { userId },
          data: { status: 'deleted', routineId: null, deletedAt: new Date() },
        });
        await tx.user.update({ where: { id: userId }, data: CLEARED_LEGACY });
      }
      // Adaptations of this routine keep their own content; only their
      // sourceRoutineId reference is cleared (onDelete: SetNull).
      await tx.routine.delete({ where: { id } });
      return { deleted: true, clearedLegacyRitual: wasLegacy };
    });
  }

  // Explicit, repeat-safe import of the legacy single ritual. Never updates
  // an existing routine, never touches the legacy fields, never re-imports.
  async function importLegacy(userId) {
    try {
      return await transaction(async (tx) => {
        const user = await lockUser(tx, userId);
        const link = await tx.ritualLegacyImport.findUnique({ where: { userId } });
        if (link) {
          if (link.status === 'linked' && link.routineId) {
            const routine = await tx.routine.findFirst({ where: { id: link.routineId, userId } });
            if (routine) return { status: 'already_imported', routine: serializeRoutine(routine, link) };
          }
          return { status: 'deleted', routine: null };
        }

        const legacySteps = parseLegacySteps(user.ritualSteps);
        if (legacySteps.length === 0) return { status: 'nothing_to_import', routine: null };

        // Legacy text predates routine screening, so it passes the same
        // rules-only screen before it can become a Routine. Flagged: nothing
        // is created, no import record is written (import is not marked
        // done) and the legacy fields stay exactly as they are. The caller
        // records the safety event and returns guidance.
        const screen = screenSafetyFields(...collectLegacyRitualText(user.ritualName, legacySteps));
        if (screen.flagged) {
          return { status: 'needs_support', routine: null, screen: { category: screen.category, riskLevel: screen.riskLevel } };
        }

        const count = await tx.routine.count({ where: { userId } });
        if (count >= LIMITS.MAX_ACTIVE_ROUTINES) throw new RoutineError('routine_limit_reached');

        const routine = await tx.routine.create({
          data: {
            userId,
            name: user.ritualName && user.ritualName.trim() ? user.ritualName : null,
            // The legacy tool was a before-you-play routine ("Do this 2-5
            // minutes before you play or train").
            category: 'session_preparation',
            sport: user.sport || null,
            role: user.position || null,
            existingHabits: [],
            steps: legacyToRoutineSteps(legacySteps),
          },
        });
        const created = await tx.ritualLegacyImport.create({
          data: { userId, routineId: routine.id, status: 'linked' },
        });
        return { status: 'imported', routine: serializeRoutine(routine, created) };
      });
    } catch (err) {
      // Unique-constraint backstop: another request imported first.
      if (err?.code === 'P2002') {
        const link = await client.ritualLegacyImport.findUnique({ where: { userId } });
        const routine = link?.routineId ? await client.routine.findFirst({ where: { id: link.routineId, userId } }) : null;
        if (routine) return { status: 'already_imported', routine: serializeRoutine(routine, link) };
        return { status: link ? 'deleted' : 'nothing_to_import', routine: null };
      }
      throw err;
    }
  }

  // POST /api/ritual/me from the current (or a cached) legacy client. The
  // legacy fields are written exactly as before; if the ritual has been
  // imported, the authoritative routine is updated in the same transaction.
  async function saveLegacyRitual(userId, { ritualName, steps }) {
    return transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.user.update({
        where: { id: userId },
        data: { ritualName, ritualSteps: JSON.stringify(steps) },
      });

      const link = await tx.ritualLegacyImport.findUnique({ where: { userId } });
      if (!link) return { mirroredTo: null };

      const routine = link.status === 'linked' && link.routineId
        ? await tx.routine.findFirst({ where: { id: link.routineId, userId } })
        : null;
      if (!routine) {
        // The imported routine was deleted. This save is new athlete
        // content, so re-arm import rather than silently diverging.
        await tx.ritualLegacyImport.delete({ where: { userId } });
        return { mirroredTo: null };
      }

      await tx.routine.update({
        where: { id: routine.id },
        data: { name: ritualName, steps: mergeLegacyIntoRoutineSteps(routine.steps, steps) },
      });
      return { mirroredTo: routine.id };
    });
  }

  // Selective deletion ("routines"): every routine, the legacy ritual
  // fields, and the import marker set to "deleted" so nothing is recreated.
  async function deleteAllForUser(userId) {
    return transaction(async (tx) => {
      await lockUser(tx, userId);
      await tx.ritualLegacyImport.updateMany({
        where: { userId },
        data: { status: 'deleted', routineId: null, deletedAt: new Date() },
      });
      const { count } = await tx.routine.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: CLEARED_LEGACY });
      return { deleted: count };
    });
  }

  return { list, get, create, update, remove, importLegacy, saveLegacyRitual, deleteAllForUser };
}

module.exports = { createRoutineStore, RoutineError, serializeRoutine };
