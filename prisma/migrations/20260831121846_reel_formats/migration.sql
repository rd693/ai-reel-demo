-- AlterTable
ALTER TABLE "Reel" ADD COLUMN "format" TEXT;

-- AlterTable
ALTER TABLE "Scene" ADD COLUMN "motionPrompt" TEXT;
ALTER TABLE "Scene" ADD COLUMN "shotType" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "artStyle" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'english',
    "targetDuration" INTEGER NOT NULL DEFAULT 60,
    "frequency" TEXT NOT NULL DEFAULT 'manual',
    "usePremiumImageStack" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL DEFAULT 'slideshow',
    "seriesContext" TEXT,
    "visualStylePrompt" TEXT,
    "targetPlatforms" TEXT NOT NULL DEFAULT '[]',
    "musicSettings" TEXT NOT NULL,
    "captionStyle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Series" ("artStyle", "captionStyle", "createdAt", "frequency", "id", "language", "musicSettings", "name", "niche", "seriesContext", "status", "targetDuration", "targetPlatforms", "updatedAt", "usePremiumImageStack", "visualStylePrompt", "voiceId") SELECT "artStyle", "captionStyle", "createdAt", "frequency", "id", "language", "musicSettings", "name", "niche", "seriesContext", "status", "targetDuration", "targetPlatforms", "updatedAt", "usePremiumImageStack", "visualStylePrompt", "voiceId" FROM "Series";
DROP TABLE "Series";
ALTER TABLE "new_Series" RENAME TO "Series";
CREATE INDEX "Series_status_idx" ON "Series"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
