-- Ritual rebuild PR 1 — routine storage foundation.
-- Additive only: two NEW tables plus their indexes and foreign keys. No
-- existing table or column is altered, renamed or dropped, and no existing
-- row is read or rewritten. The legacy single ritual stays on
-- "User"."ritualName" / "User"."ritualSteps" exactly as before; it is only
-- copied into "Routine" when the athlete's client explicitly calls
-- POST /api/routines/import-legacy.
--
-- Generated with `prisma migrate diff` from the pre-change schema. Production
-- still applies schema via `prisma db push` in `npm start`; this file is the
-- reviewable record of exactly what that push creates.

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "category" TEXT NOT NULL,
    "sport" TEXT,
    "role" TEXT,
    "moment" TEXT,
    "startTrigger" TEXT,
    "existingHabits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purpose" TEXT,
    "steps" JSONB NOT NULL,
    "sourceRoutineId" TEXT,
    "templateKey" TEXT,
    "templateVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RitualLegacyImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routineId" TEXT,
    "status" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RitualLegacyImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_userId_createdAt_idx" ON "Routine"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RitualLegacyImport_userId_key" ON "RitualLegacyImport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RitualLegacyImport_routineId_key" ON "RitualLegacyImport"("routineId");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_sourceRoutineId_fkey" FOREIGN KEY ("sourceRoutineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RitualLegacyImport" ADD CONSTRAINT "RitualLegacyImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RitualLegacyImport" ADD CONSTRAINT "RitualLegacyImport_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

