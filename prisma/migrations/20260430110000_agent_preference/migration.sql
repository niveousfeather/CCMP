-- Store lightweight per-user Agent defaults for follow-up tasks.
CREATE TABLE "AgentPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fileName" TEXT,
    "documentType" TEXT,
    "styleHint" TEXT,
    "lengthHint" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AgentPreference_userId_key" ON "AgentPreference"("userId");
