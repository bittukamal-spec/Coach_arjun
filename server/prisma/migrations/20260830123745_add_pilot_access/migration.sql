-- Pilot beta entitlement (temporary, founder-granted Coach/chat access
-- independent of trial/billing). Additive only: two new nullable columns,
-- no default, no backfill — every existing row gets pilotAccessUntil = NULL
-- and pilotAccessGrantedAt = NULL, which is "no pilot access", identical to
-- current behavior. See server/src/routes/chat.js's isEntitled() and
-- server/src/routes/founderPilotAccess.js (the only writer of these columns).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pilotAccessGrantedAt" TIMESTAMP(3),
ADD COLUMN     "pilotAccessUntil" TIMESTAMP(3);
