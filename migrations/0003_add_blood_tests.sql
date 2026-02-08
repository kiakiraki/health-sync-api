-- Migration number: 0003    2026-02-05
-- Add blood_tests table for laboratory test results

CREATE TABLE blood_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD
    facility TEXT,                    -- 検査施設名
    glucose REAL,                     -- 空腹時血糖 mg/dL
    hba1c REAL,                       -- HbA1c %
    hdl REAL,                         -- HDLコレステロール mg/dL
    ldl REAL,                         -- LDLコレステロール mg/dL
    tg REAL,                          -- 中性脂肪 mg/dL
    ua REAL,                          -- 尿酸 mg/dL
    cr REAL,                          -- クレアチニン mg/dL
    egfr REAL,                        -- eGFR mL/min/1.73m²
    ast REAL,                         -- AST U/L
    alt REAL,                         -- ALT U/L
    gtp REAL,                         -- γ-GTP U/L
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_blood_tests_date ON blood_tests(test_date);
