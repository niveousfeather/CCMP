-- CreateTable
CREATE TABLE "UserQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "totalQuota" INTEGER NOT NULL DEFAULT 100,
    "usedQuota" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserQuota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "style" TEXT,
    "aspectRatio" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'text-to-image',
    "status" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "url" TEXT,
    "objectKey" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImageAsset_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ImageGeneration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserQuota_userId_key" ON "UserQuota"("userId");

-- Backfill existing users with the default quota used by the initial deployment.
INSERT INTO "UserQuota" ("id", "userId", "totalQuota", "usedQuota", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), "id", 100, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
WHERE "id" NOT IN (SELECT "userId" FROM "UserQuota");

-- CreateIndex
CREATE INDEX "ImageGeneration_userId_createdAt_idx" ON "ImageGeneration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_generationId_index_idx" ON "ImageAsset"("generationId", "index");
