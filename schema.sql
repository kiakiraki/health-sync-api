-- Body measurements (体重・体脂肪率)
CREATE TABLE IF NOT EXISTS body_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    weight_kg REAL,
    body_fat_percent REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Blood pressure (血圧)
CREATE TABLE IF NOT EXISTS blood_pressure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_at TEXT NOT NULL,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sleep sessions (睡眠)
CREATE TABLE IF NOT EXISTS sleep_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration_hours REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Steps (歩数)
CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_body_recorded ON body_measurements(recorded_at);
CREATE INDEX IF NOT EXISTS idx_bp_recorded ON blood_pressure(recorded_at);
CREATE INDEX IF NOT EXISTS idx_sleep_start ON sleep_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_steps_date ON steps(date);
