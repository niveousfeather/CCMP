CREATE TABLE "VideoGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageObjectKey" TEXT,
    "model" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "duration" TEXT,
    "ratio" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL,
    "resultVideoUrl" TEXT,
    "coverImageUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "VideoGeneration_userId_createdAt_idx" ON "VideoGeneration"("userId", "createdAt");
CREATE INDEX "VideoGeneration_taskId_idx" ON "VideoGeneration"("taskId");
