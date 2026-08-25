// Shared in-memory Prisma stub for Pilot Communications v1 tests — used by
// both pilotCommunications.test.js (athlete surface) and
// founderPilotCommunications.test.js (founder surface), same convention as
// founderSafetyEventsApi.test.js's makeStubClient: real HTTP requests
// against a stub, no database ever touched. `$transaction(fn)` just calls
// `fn(client)` — the mutations already operate on the same in-memory
// arrays, so there is nothing extra a fake transaction needs to provide for
// these tests.

function makeState({ users = [], communications = [], targets = [], responses = [] } = {}) {
  return { users, communications, targets, responses };
}

function matchesIdWhere(value, cond) {
  if (cond === undefined) return true;
  if (typeof cond === 'string') return value === cond;
  if (cond.in) return cond.in.includes(value);
  return true;
}

function makeStubClient(state) {
  let seq = 0;
  const nextId = (prefix) => `${prefix}${++seq}`;

  const client = {
    user: {
      findMany: async ({ where, select, orderBy } = {}) => {
        let list = state.users;
        if (where?.id) list = list.filter((u) => matchesIdWhere(u.id, where.id));
        if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
        if (!select) return list.map((u) => ({ ...u }));
        return list.map((u) => {
          const row = {};
          for (const k of Object.keys(select)) if (select[k]) row[k] = u[k];
          return row;
        });
      },
    },

    pilotCommunication: {
      findUnique: async ({ where: { id } }) => {
        const row = state.communications.find((c) => c.id === id);
        return row ? { ...row } : null;
      },
      findMany: async ({ where, orderBy } = {}) => {
        let list = state.communications;
        if (where?.isActive !== undefined) list = list.filter((c) => c.isActive === where.isActive);
        if (orderBy?.createdAt === 'desc') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
        return list.map((c) => ({ ...c }));
      },
      create: async ({ data }) => {
        const row = {
          id: nextId('comm'),
          isActive: false,
          publishedAt: null,
          responseType: null,
          responseOptions: '[]',
          ctaRoute: null,
          ctaLabel: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.communications.push(row);
        return { ...row };
      },
      update: async ({ where: { id }, data }) => {
        const row = state.communications.find((c) => c.id === id);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
    },

    pilotCommunicationTarget: {
      findUnique: async ({ where: { communicationId_userId: { communicationId, userId } } }) => {
        const row = state.targets.find((t) => t.communicationId === communicationId && t.userId === userId);
        return row ? { ...row } : null;
      },
      findMany: async ({ where, include } = {}) => {
        let list = state.targets;
        if (where?.userId) list = list.filter((t) => t.userId === where.userId);
        if (where?.communicationId) list = list.filter((t) => matchesIdWhere(t.communicationId, where.communicationId));
        if (where?.communication?.isActive !== undefined) {
          list = list.filter((t) => {
            const c = state.communications.find((cc) => cc.id === t.communicationId);
            return c && c.isActive === where.communication.isActive;
          });
        }
        return list.map((t) => {
          const row = { ...t };
          if (include?.communication) {
            const c = state.communications.find((cc) => cc.id === t.communicationId);
            row.communication = c ? { ...c } : null;
            if (row.communication && include.communication.include?.responses) {
              const respWhere = include.communication.include.responses.where;
              row.communication.responses = state.responses
                .filter((r) => r.communicationId === c.id && (!respWhere?.userId || r.userId === respWhere.userId))
                .map((r) => ({ ...r }));
            }
          }
          if (include?.user) {
            const u = state.users.find((uu) => uu.id === t.userId);
            row.user = u ? { id: u.id, name: u.name, sport: u.sport } : null;
          }
          return row;
        });
      },
      create: async ({ data }) => {
        const row = { id: nextId('tgt'), createdAt: new Date(), ...data };
        state.targets.push(row);
        return { ...row };
      },
      createMany: async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const d of data) {
          const exists = state.targets.some((t) => t.communicationId === d.communicationId && t.userId === d.userId);
          if (exists && skipDuplicates) continue;
          state.targets.push({ id: nextId('tgt'), createdAt: new Date(), ...d });
          count += 1;
        }
        return { count };
      },
      count: async ({ where } = {}) => {
        let list = state.targets;
        if (where?.communicationId) list = list.filter((t) => matchesIdWhere(t.communicationId, where.communicationId));
        return list.length;
      },
    },

    pilotCommunicationResponse: {
      findUnique: async ({ where: { communicationId_userId: { communicationId, userId } } }) => {
        const row = state.responses.find((r) => r.communicationId === communicationId && r.userId === userId);
        return row ? { ...row } : null;
      },
      findMany: async ({ where } = {}) => {
        let list = state.responses;
        if (where?.userId) list = list.filter((r) => r.userId === where.userId);
        if (where?.communicationId) list = list.filter((r) => matchesIdWhere(r.communicationId, where.communicationId));
        return list.map((r) => ({ ...r }));
      },
      create: async ({ data }) => {
        const row = {
          id: nextId('resp'),
          seenAt: null,
          deferCount: 0,
          dismissedAt: null,
          responseValue: null,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.responses.push(row);
        return { ...row };
      },
      update: async ({ where: { id }, data }) => {
        const row = state.responses.find((r) => r.id === id);
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'increment' in v) row[k] = (row[k] || 0) + v.increment;
          else row[k] = v;
        }
        row.updatedAt = new Date();
        return { ...row };
      },
      upsert: async ({ where: { communicationId_userId: { communicationId, userId } }, create, update }) => {
        let row = state.responses.find((r) => r.communicationId === communicationId && r.userId === userId);
        if (!row) {
          row = {
            id: nextId('resp'),
            seenAt: null,
            deferCount: 0,
            dismissedAt: null,
            responseValue: null,
            respondedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          state.responses.push(row);
        } else {
          Object.assign(row, update);
          row.updatedAt = new Date();
        }
        return { ...row };
      },
    },

    $transaction: async (fn) => fn(client),
  };

  return client;
}

module.exports = { makeState, makeStubClient };
