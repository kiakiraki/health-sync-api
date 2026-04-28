import { env } from 'cloudflare:test';

// Setup database tables for tests
// This runs before all tests
const setupDatabase = async () => {
	const db = env.health_sync_db;

	// Create tables one by one using prepare().run()
	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS body_measurements (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recorded_at TEXT NOT NULL,
			weight_kg REAL,
			body_fat_percent REAL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`,
		)
		.run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS blood_pressure (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recorded_at TEXT NOT NULL,
			systolic INTEGER NOT NULL,
			diastolic INTEGER NOT NULL,
			pulse INTEGER,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`,
		)
		.run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS sleep_sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			start_time TEXT NOT NULL,
			end_time TEXT NOT NULL,
			duration_hours REAL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`,
		)
		.run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS steps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date TEXT NOT NULL,
			count INTEGER NOT NULL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP
		)
	`,
		)
		.run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS cpap_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			recorded_date TEXT NOT NULL UNIQUE,
			ahi REAL,
			ai REAL,
			leak REAL,
			usage_hours REAL,
			notes TEXT,
			ai_count INTEGER,
			hi_count INTEGER,
			csa_count INTEGER,
			snore_count INTEGER,
			ai_total_duration_sec REAL,
			hi_total_duration_sec REAL,
			pressure_min REAL,
			pressure_max REAL,
			pressure_mean REAL,
			pressure_median REAL,
			pressure_p90 REAL,
			pressure_p95 REAL,
			br_mean REAL,
			br_median REAL,
			tv_mean REAL,
			tv_median REAL,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`,
		)
		.run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS blood_tests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			test_date TEXT NOT NULL UNIQUE,
			facility TEXT,
			glucose REAL,
			hba1c REAL,
			hdl REAL,
			ldl REAL,
			tg REAL,
			ua REAL,
			cr REAL,
			egfr REAL,
			ast REAL,
			alt REAL,
			gtp REAL,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`,
		)
		.run();

	// Create unique indexes
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_body_measurements_recorded_at ON body_measurements(recorded_at)`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_blood_pressure_recorded_at ON blood_pressure(recorded_at)`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_sessions_start_time ON sleep_sessions(start_time)`).run();
	await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_date ON steps(date)`).run();

	await db
		.prepare(
			`
		CREATE TABLE IF NOT EXISTS sleep_stages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			sleep_session_id INTEGER NOT NULL,
			stage TEXT NOT NULL,
			start_time TEXT NOT NULL,
			end_time TEXT NOT NULL,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (sleep_session_id) REFERENCES sleep_sessions(id) ON DELETE CASCADE
		)
	`,
		)
		.run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_sleep_stages_session_id ON sleep_stages(sleep_session_id)`).run();
	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_blood_tests_date ON blood_tests(test_date)`).run();

	await db
		.prepare(
			`
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
		)
	`,
		)
		.run();

	await db.prepare(`CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date)`).run();
};

await setupDatabase();
