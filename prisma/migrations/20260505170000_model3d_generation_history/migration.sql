-- CreateTable
CREATE TABLE "Model3DGeneration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tripo',
    "providerTaskId" TEXT,
    "feature" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rawStatus" TEXT,
    "quality" TEXT,
    "generationProfile" TEXT,
    "textureEnabled" BOOLEAN NOT NULL DEFAULT true,
    "textureQuality" TEXT,
    "pbrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "generatePartsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inputImageUrl" TEXT,
    "inputImagesJson" TEXT,
    "modelUrl" TEXT,
    "modelObjectKey" TEXT,
    "previewImageUrl" TEXT,
    "previewImageObjectKey" TEXT,
    "exportUrl" TEXT,
    "exportObjectKey" TEXT,
    "errorMessage" TEXT,
    "providerMeta" TEXT,
    "operationsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Model3DGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Model3DGeneration_taskId_key" ON "Model3DGeneration"("taskId");

-- CreateIndex
CREATE INDEX "Model3DGeneration_userId_updatedAt_idx" ON "Model3DGeneration"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Model3DGeneration_providerTaskId_idx" ON "Model3DGeneration"("providerTaskId");
