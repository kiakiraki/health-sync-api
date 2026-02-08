-- Migration number: 0001 	 2026-02-03T10:20:14.867Z

CREATE TABLE cpap_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_date TEXT NOT NULL UNIQUE,
    ahi REAL,
    ai REAL,
    leak REAL,
    usage_hours REAL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cpap_date ON cpap_logs(recorded_date);
