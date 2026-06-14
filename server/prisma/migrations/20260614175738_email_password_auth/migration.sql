-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT,
    "avatar" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "language" TEXT NOT NULL DEFAULT 'en',
    "sport" TEXT,
    "experienceLevel" TEXT,
    "goals" TEXT NOT NULL DEFAULT '[]',
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "email", "experienceLevel", "goals", "googleId", "id", "language", "name", "onboardingDone", "sport", "tier", "updatedAt") SELECT "avatar", "createdAt", "email", "experienceLevel", "goals", "googleId", "id", "language", "name", "onboardingDone", "sport", "tier", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
