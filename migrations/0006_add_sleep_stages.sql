-- Migration number: 0006
-- Add sleep_stages child table for Health Connect sleep stage data

CREATE TABLE IF NOT EXISTS sleep_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sleep_session_id INTEGER NOT NULL,
    stage TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sleep_session_id) REFERENCES sleep_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sleep_stages_session_id ON sleep_stages(sleep_session_id);
