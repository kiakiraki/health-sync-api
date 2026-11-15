-- Migration number: 0009 	 2026-11-15
-- Drop non-unique indexes that duplicate a unique index on the same
-- leading column, so each write maintains one index instead of two.
--   idx_body_recorded / idx_bp_recorded / idx_sleep_start (schema.sql)
--     duplicate the unique indexes added in 0002
--   idx_cpap_date (0001) / idx_blood_tests_date (0003)
--     duplicate the autoindex behind the column's UNIQUE constraint
--   idx_meals_date (0005)
--     is a prefix of the UNIQUE(date, meal_type) autoindex
-- IF EXISTS: the first three only exist on databases bootstrapped from
-- schema.sql.
DROP INDEX IF EXISTS idx_body_recorded;
DROP INDEX IF EXISTS idx_bp_recorded;
DROP INDEX IF EXISTS idx_sleep_start;
DROP INDEX IF EXISTS idx_cpap_date;
DROP INDEX IF EXISTS idx_blood_tests_date;
DROP INDEX IF EXISTS idx_meals_date;
