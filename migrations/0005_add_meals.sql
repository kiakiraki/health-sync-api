-- Migration number: 0005
-- Add meals table for meal tracking

CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    description TEXT NOT NULL,
    calories_kcal REAL,
    protein_g REAL,
    fat_g REAL,
    carbs_g REAL,
    fiber_g REAL,
    salt_g REAL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
