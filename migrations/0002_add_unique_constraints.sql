-- Migration number: 0002 	 2026-02-04
-- Add unique constraints to enable upsert behavior

CREATE UNIQUE INDEX IF NOT EXISTS idx_body_measurements_recorded_at ON body_measurements(recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blood_pressure_recorded_at ON blood_pressure(recorded_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_sessions_start_time ON sleep_sessions(start_time);
CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_date ON steps(date);
