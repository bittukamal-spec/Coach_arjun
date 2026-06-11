-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mood" INTEGER NOT NULL,
    "focus" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reflection" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
