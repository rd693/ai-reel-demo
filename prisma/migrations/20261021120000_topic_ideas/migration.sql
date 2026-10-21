-- CreateTable
CREATE TABLE "TopicIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "angle" TEXT,
    "rationale" TEXT,
    "trendSource" TEXT NOT NULL DEFAULT 'evergreen',
    "score" INTEGER NOT NULL DEFAULT 50,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "usedReelId" TEXT,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TopicIdea_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TopicIdea_seriesId_status_sortOrder_idx" ON "TopicIdea"("seriesId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TopicIdea_seriesId_dedupeKey_key" ON "TopicIdea"("seriesId", "dedupeKey");
