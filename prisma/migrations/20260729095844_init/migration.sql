-- CreateTable
CREATE TABLE "Series" (
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
    "seriesContext" TEXT,
    "visualStylePrompt" TEXT,
    "targetPlatforms" TEXT NOT NULL DEFAULT '[]',
    "musicSettings" TEXT NOT NULL,
    "captionStyle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "script" TEXT NOT NULL DEFAULT '',
    "brandColor" TEXT NOT NULL DEFAULT '#6366f1',
    "accentColor" TEXT NOT NULL DEFAULT '#facc15',
    "language" TEXT,
    "artStyle" TEXT,
    "visualStyleOverride" TEXT,
    "usePremiumImageStack" BOOLEAN NOT NULL DEFAULT false,
    "seed" INTEGER,
    "voiceoverPath" TEXT,
    "actualDurationMs" INTEGER,
    "captionWords" TEXT,
    "generationStatus" TEXT NOT NULL DEFAULT 'pending',
    "generationError" TEXT,
    "musicSettings" TEXT,
    "captionStyle" TEXT,
    "scheduledFor" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reel_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'hook',
    "headline" TEXT NOT NULL,
    "narrationText" TEXT,
    "visualPrompt" TEXT,
    "backgroundPath" TEXT,
    "backgroundType" TEXT DEFAULT 'image',
    "durationInSeconds" REAL NOT NULL DEFAULT 3,
    "startMs" INTEGER,
    "endMs" INTEGER,
    CONSTRAINT "Scene_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputPath" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "RenderJob_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'image',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Series_status_idx" ON "Series"("status");

-- CreateIndex
CREATE INDEX "Reel_seriesId_idx" ON "Reel"("seriesId");

-- CreateIndex
CREATE INDEX "Reel_generationStatus_idx" ON "Reel"("generationStatus");

-- CreateIndex
CREATE INDEX "Reel_scheduledFor_idx" ON "Reel"("scheduledFor");

-- CreateIndex
CREATE INDEX "Scene_reelId_idx" ON "Scene"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_reelId_index_key" ON "Scene"("reelId", "index");

-- CreateIndex
CREATE INDEX "RenderJob_reelId_idx" ON "RenderJob"("reelId");

-- CreateIndex
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");
