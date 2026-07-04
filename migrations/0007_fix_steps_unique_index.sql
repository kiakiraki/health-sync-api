-- Migration number: 0007 	 2026-07-04
-- schema.sql creates a NON-unique idx_steps_date, so 0002's
-- CREATE UNIQUE INDEX IF NOT EXISTS with the same name was a no-op on any
-- database bootstrapped from schema.sql, leaving ON CONFLICT(date) upserts
-- on steps broken (SQLITE_ERROR). Recreate the index as UNIQUE.
-- The DELETE keeps the newest row per date; it is a no-op when the index
-- was already unique.
DROP INDEX IF EXISTS idx_steps_date;
DELETE FROM steps WHERE id NOT IN (SELECT MAX(id) FROM steps GROUP BY date);
CREATE UNIQUE INDEX idx_steps_date ON steps(date);
