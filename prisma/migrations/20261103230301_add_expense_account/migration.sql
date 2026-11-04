-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "frequency" TEXT NOT NULL DEFAULT 'MENSUEL',
    "startMonth" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RecurringExpense" ("active", "amount", "category", "createdAt", "dayOfMonth", "frequency", "id", "name", "note", "startMonth", "updatedAt") SELECT "active", "amount", "category", "createdAt", "dayOfMonth", "frequency", "id", "name", "note", "startMonth", "updatedAt" FROM "RecurringExpense";
DROP TABLE "RecurringExpense";
ALTER TABLE "new_RecurringExpense" RENAME TO "RecurringExpense";
CREATE INDEX "RecurringExpense_accountId_idx" ON "RecurringExpense"("accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
