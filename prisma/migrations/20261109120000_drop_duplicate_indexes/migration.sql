-- The unique indexes on (accountId, date) and (accountId, date, name) already
-- serve every lookup these plain indexes did; keeping both only slowed writes.
DROP INDEX "Entry_accountId_date_idx";
DROP INDEX "Position_accountId_date_idx";
