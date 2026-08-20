interface BodyMeasurement {
	recorded_at: string;
	weight_kg?: number;
	body_fat_percent?: number;
}

interface BloodPressure {
	recorded_at: string;
	systolic: number;
	diastolic: number;
	pulse?: number;
}

interface SleepStage {
	stage: string;
	start_time: string;
	end_time: string;
}

interface SleepSession {
	start_time: string;
	end_time: string;
	duration_hours?: number;
	stages?: SleepStage[];
}

interface Steps {
	date: string;
	count: number;
}

interface CpapLog {
	recorded_date: string;
	ahi?: number;
	ai?: number;
	leak?: number;
	usage_hours?: number;
	notes?: string;
	ai_count?: number;
	hi_count?: number;
	csa_count?: number;
	snore_count?: number;
	ai_total_duration_sec?: number;
	hi_total_duration_sec?: number;
	pressure_min?: number;
	pressure_max?: number;
	pressure_mean?: number;
	pressure_median?: number;
	pressure_p90?: number;
	pressure_p95?: number;
	br_mean?: number;
	br_median?: number;
	tv_mean?: number;
	tv_median?: number;
}

interface BloodTest {
	test_date: string;
	facility?: string;
	glucose?: number;
	hba1c?: number;
	hdl?: number;
	ldl?: number;
	tg?: number;
	ua?: number;
	cr?: number;
	egfr?: number;
	ast?: number;
	alt?: number;
	gtp?: number;
}

interface MealRecord {
	date: string;
	meal_type: string;
	description: string;
	calories_kcal?: number;
	protein_g?: number;
	fat_g?: number;
	carbs_g?: number;
	fiber_g?: number;
	salt_g?: number;
	note?: string;
}

interface HeartRateSample {
	recorded_at: string;
	bpm: number;
}

interface RestingHeartRate {
	date: string;
	bpm: number;
}

interface Spo2Sample {
	recorded_at: string;
	percentage: number;
}

interface DailyActivity {
	date: string;
	active_calories_kcal?: number;
	total_calories_kcal?: number;
}

interface SyncRequest {
	body_measurements?: BodyMeasurement[];
	blood_pressure?: BloodPressure[];
	sleep_sessions?: SleepSession[];
	steps?: Steps[];
	heart_rate?: HeartRateSample[];
	resting_heart_rate?: RestingHeartRate[];
	spo2?: Spo2Sample[];
	daily_activity?: DailyActivity[];
}

function mergeConsecutiveStages(stages: SleepStage[]): SleepStage[] {
	if (stages.length === 0) return [];
	const sorted = [...stages].sort((a, b) => a.start_time.localeCompare(b.start_time));
	const merged: SleepStage[] = [{ ...sorted[0] }];
	for (let i = 1; i < sorted.length; i++) {
		const last = merged[merged.length - 1];
		if (sorted[i].stage === last.stage) {
			last.end_time = sorted[i].end_time;
		} else {
			merged.push({ ...sorted[i] });
		}
	}
	return merged;
}

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function errorResponse(message: string, status: number, extra?: Record<string, unknown>): Response {
	return jsonResponse({ error: message, ...extra }, status);
}

function handleDbError(error: unknown): Response {
	console.error('Database error:', error);
	return errorResponse('Database operation failed', 500);
}

async function withDbErrorHandling(handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (error) {
		return handleDbError(error);
	}
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

// --- request body validation helpers -------------------------------------
// SQLite (D1) has no strict column typing, so without these checks a payload
// with e.g. a string in a numeric field would be stored as-is, and a missing
// NOT NULL field would surface as a 500 instead of a 400.

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

// Optional fields: absent / null are fine, present values must match the type.
function isOptionalNumber(value: unknown): boolean {
	return value === undefined || value === null || isFiniteNumber(value);
}

function isOptionalString(value: unknown): boolean {
	return value === undefined || value === null || typeof value === 'string';
}

function validateNumericFields(body: Record<string, unknown>, fields: readonly string[]): string | null {
	for (const field of fields) {
		if (!isOptionalNumber(body[field])) return `${field} must be a number`;
	}
	return null;
}

function validateSyncRequest(body: unknown): string | null {
	if (!isPlainObject(body)) return 'Request body must be a JSON object';

	for (const key of [
		'body_measurements',
		'blood_pressure',
		'sleep_sessions',
		'steps',
		'heart_rate',
		'resting_heart_rate',
		'spo2',
		'daily_activity',
	]) {
		const value = body[key];
		if (value !== undefined && value !== null && !Array.isArray(value)) return `${key} must be an array`;
	}

	const bodyMeasurements = (body.body_measurements ?? []) as unknown[];
	for (let i = 0; i < bodyMeasurements.length; i++) {
		const m = bodyMeasurements[i];
		if (!isPlainObject(m)) return `body_measurements[${i}] must be an object`;
		if (!isNonEmptyString(m.recorded_at)) return `body_measurements[${i}].recorded_at must be a non-empty string`;
		if (!isOptionalNumber(m.weight_kg)) return `body_measurements[${i}].weight_kg must be a number`;
		if (!isOptionalNumber(m.body_fat_percent)) return `body_measurements[${i}].body_fat_percent must be a number`;
	}

	const bloodPressure = (body.blood_pressure ?? []) as unknown[];
	for (let i = 0; i < bloodPressure.length; i++) {
		const bp = bloodPressure[i];
		if (!isPlainObject(bp)) return `blood_pressure[${i}] must be an object`;
		if (!isNonEmptyString(bp.recorded_at)) return `blood_pressure[${i}].recorded_at must be a non-empty string`;
		if (!isFiniteNumber(bp.systolic)) return `blood_pressure[${i}].systolic must be a number`;
		if (!isFiniteNumber(bp.diastolic)) return `blood_pressure[${i}].diastolic must be a number`;
		if (!isOptionalNumber(bp.pulse)) return `blood_pressure[${i}].pulse must be a number`;
	}

	const sleepSessions = (body.sleep_sessions ?? []) as unknown[];
	for (let i = 0; i < sleepSessions.length; i++) {
		const s = sleepSessions[i];
		if (!isPlainObject(s)) return `sleep_sessions[${i}] must be an object`;
		if (!isNonEmptyString(s.start_time)) return `sleep_sessions[${i}].start_time must be a non-empty string`;
		if (!isNonEmptyString(s.end_time)) return `sleep_sessions[${i}].end_time must be a non-empty string`;
		if (!isOptionalNumber(s.duration_hours)) return `sleep_sessions[${i}].duration_hours must be a number`;
		if (s.stages !== undefined && s.stages !== null) {
			if (!Array.isArray(s.stages)) return `sleep_sessions[${i}].stages must be an array`;
			for (let j = 0; j < s.stages.length; j++) {
				const stage = s.stages[j] as unknown;
				if (!isPlainObject(stage)) return `sleep_sessions[${i}].stages[${j}] must be an object`;
				if (!isNonEmptyString(stage.stage)) return `sleep_sessions[${i}].stages[${j}].stage must be a non-empty string`;
				if (!isNonEmptyString(stage.start_time)) return `sleep_sessions[${i}].stages[${j}].start_time must be a non-empty string`;
				if (!isNonEmptyString(stage.end_time)) return `sleep_sessions[${i}].stages[${j}].end_time must be a non-empty string`;
			}
		}
	}

	const steps = (body.steps ?? []) as unknown[];
	for (let i = 0; i < steps.length; i++) {
		const st = steps[i];
		if (!isPlainObject(st)) return `steps[${i}] must be an object`;
		if (!isNonEmptyString(st.date) || !DATE_FORMAT.test(st.date)) return `steps[${i}].date must be YYYY-MM-DD`;
		if (!isFiniteNumber(st.count)) return `steps[${i}].count must be a number`;
	}

	const heartRate = (body.heart_rate ?? []) as unknown[];
	for (let i = 0; i < heartRate.length; i++) {
		const hr = heartRate[i];
		if (!isPlainObject(hr)) return `heart_rate[${i}] must be an object`;
		if (!isNonEmptyString(hr.recorded_at)) return `heart_rate[${i}].recorded_at must be a non-empty string`;
		if (!isFiniteNumber(hr.bpm)) return `heart_rate[${i}].bpm must be a number`;
	}

	const restingHeartRate = (body.resting_heart_rate ?? []) as unknown[];
	for (let i = 0; i < restingHeartRate.length; i++) {
		const rhr = restingHeartRate[i];
		if (!isPlainObject(rhr)) return `resting_heart_rate[${i}] must be an object`;
		if (!isNonEmptyString(rhr.date) || !DATE_FORMAT.test(rhr.date)) return `resting_heart_rate[${i}].date must be YYYY-MM-DD`;
		if (!isFiniteNumber(rhr.bpm)) return `resting_heart_rate[${i}].bpm must be a number`;
	}

	const spo2 = (body.spo2 ?? []) as unknown[];
	for (let i = 0; i < spo2.length; i++) {
		const sp = spo2[i];
		if (!isPlainObject(sp)) return `spo2[${i}] must be an object`;
		if (!isNonEmptyString(sp.recorded_at)) return `spo2[${i}].recorded_at must be a non-empty string`;
		if (!isFiniteNumber(sp.percentage)) return `spo2[${i}].percentage must be a number`;
	}

	const dailyActivity = (body.daily_activity ?? []) as unknown[];
	for (let i = 0; i < dailyActivity.length; i++) {
		const da = dailyActivity[i];
		if (!isPlainObject(da)) return `daily_activity[${i}] must be an object`;
		if (!isNonEmptyString(da.date) || !DATE_FORMAT.test(da.date)) return `daily_activity[${i}].date must be YYYY-MM-DD`;
		if (!isOptionalNumber(da.active_calories_kcal)) return `daily_activity[${i}].active_calories_kcal must be a number`;
		if (!isOptionalNumber(da.total_calories_kcal)) return `daily_activity[${i}].total_calories_kcal must be a number`;
	}

	return null;
}

// The whole API treats "today" and date-typed columns in this timezone.
// Health Connect data flows in via the Android client, which records
// `steps.date` etc. as JST LocalDate, so the server side has to anchor
// on the same wall clock to keep windows consistent.
const APP_TZ = 'Asia/Tokyo';

// JST today's YYYY-MM-DD. en-CA formats LocalDate as ISO already.
// Exported with an optional `now` for unit testing — Cloudflare's vitest pool
// runs Worker code in an isolate where vi.setSystemTime doesn't reach.
export function todayInAppTZ(now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(now);
}

export function daysAgoDate(days: number, now: Date = new Date()): string {
	// Anchor arithmetic on the JST date as a UTC midnight pseudo-Date,
	// so day-shifting via setUTCDate isn't perturbed by the runtime's TZ.
	const today = new Date(`${todayInAppTZ(now)}T00:00:00Z`);
	today.setUTCDate(today.getUTCDate() - days);
	return today.toISOString().split('T')[0];
}

function parseDateRangeParams(url: URL, defaultDays?: number): { from?: string; to?: string; error?: Response } {
	const fromParam = url.searchParams.get('from');
	const toParam = url.searchParams.get('to');
	const daysParam = url.searchParams.get('days');

	// from/to takes priority over days
	if (fromParam || toParam) {
		if (fromParam && !DATE_FORMAT.test(fromParam)) {
			return { error: errorResponse('Invalid from parameter (must be YYYY-MM-DD)', 400) };
		}
		if (toParam && !DATE_FORMAT.test(toParam)) {
			return { error: errorResponse('Invalid to parameter (must be YYYY-MM-DD)', 400) };
		}
		if (fromParam && toParam && fromParam > toParam) {
			return { error: errorResponse('from must not be after to', 400) };
		}
		return { from: fromParam ?? undefined, to: toParam ?? undefined };
	}

	// days parameter
	if (daysParam) {
		// /^\d+$/ before parseInt — parseInt('7abc') would silently return 7.
		if (!/^\d+$/.test(daysParam)) {
			return { error: errorResponse('Invalid days parameter (must be a positive integer)', 400) };
		}
		const days = parseInt(daysParam, 10);
		if (days < 1) {
			return { error: errorResponse('Invalid days parameter (must be a positive integer)', 400) };
		}
		return { from: daysAgoDate(days) };
	}

	// No parameters: use default if provided
	if (defaultDays !== undefined) {
		return { from: daysAgoDate(defaultDays) };
	}

	return {};
}

// JST 00:00:00 of `date` expressed as a UTC ISO Z string.
// Asia/Tokyo has no DST and a fixed +09:00 offset, so the literal offset is safe.
function jstDayStartUtc(date: string): string {
	return new Date(`${date}T00:00:00+09:00`).toISOString();
}

// JST 00:00:00 of (date + 1 day) expressed as a UTC ISO Z string.
// Used as a half-open upper bound to avoid ASCII-ordering hazards (see below).
function nextJstDayStartUtc(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return jstDayStartUtc(d.toISOString().split('T')[0]);
}

function buildDateFilter(
	column: string,
	type: 'date' | 'datetime',
	range: { from?: string; to?: string },
): { clause: string; params: string[] } {
	const conditions: string[] = [];
	const params: string[] = [];

	if (range.from) {
		conditions.push(`${column} >= ?`);
		// datetime columns hold UTC ISO 8601 ('...Z') because the Android client
		// formats Instants via DateTimeFormatter.ISO_INSTANT. Treat ?from=YYYY-MM-DD
		// as JST 00:00:00 on that wall-clock day, converted to UTC for comparison.
		params.push(type === 'datetime' ? jstDayStartUtc(range.from) : range.from);
	}

	if (range.to) {
		if (type === 'datetime') {
			// Half-open upper bound: `< start of (to+1) JST day in UTC`.
			// A naive inclusive `<= '...T23:59:59.999Z'` would silently drop
			// stored values like '...T59Z' (no ms suffix, common from
			// ISO_INSTANT) because 'Z' > '.' in ASCII order makes
			// '...59Z' > '...59.999Z'. Half-open avoids the trap entirely.
			conditions.push(`${column} < ?`);
			params.push(nextJstDayStartUtc(range.to));
		} else {
			conditions.push(`${column} <= ?`);
			params.push(range.to);
		}
	}

	const clause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
	return { clause, params };
}

// Constant-time string comparison via the Workers-specific
// crypto.subtle.timingSafeEqual extension (throws on unequal lengths,
// hence the explicit length check — the length itself is not secret).
function timingSafeEqualStrings(a: string, b: string): boolean {
	const encoder = new TextEncoder();
	const aBytes = encoder.encode(a);
	const bBytes = encoder.encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) return false;
	return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

function authenticate(request: Request, env: Env): Response | null {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return errorResponse('Unauthorized', 401);
	}
	const token = authHeader.slice(7);
	if (!timingSafeEqualStrings(token, env.API_KEY)) {
		return errorResponse('Unauthorized', 401);
	}
	return null;
}

async function handleHealth(): Promise<Response> {
	return jsonResponse({
		status: 'ok',
		timestamp: new Date().toISOString(),
	});
}

async function handleSync(request: Request, env: Env): Promise<Response> {
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	const validationError = validateSyncRequest(parsed);
	if (validationError) {
		return errorResponse(validationError, 400);
	}
	const body = parsed as SyncRequest;

	const counts = {
		body_measurements: body.body_measurements?.length ?? 0,
		blood_pressure: body.blood_pressure?.length ?? 0,
		sleep_sessions: body.sleep_sessions?.length ?? 0,
		steps: body.steps?.length ?? 0,
		heart_rate: body.heart_rate?.length ?? 0,
		resting_heart_rate: body.resting_heart_rate?.length ?? 0,
		spo2: body.spo2?.length ?? 0,
		daily_activity: body.daily_activity?.length ?? 0,
	};

	return withDbErrorHandling(async () => {
		const db = env.health_sync_db;

		// Phase 1: upserts that don't depend on freshly-generated ids,
		// plus sleep_sessions UPSERT with RETURNING id (avoids the
		// previous SELECT-after-INSERT N+1).
		const phase1: D1PreparedStatement[] = [];

		if (body.body_measurements?.length) {
			const stmt = db.prepare(
				`INSERT INTO body_measurements (recorded_at, weight_kg, body_fat_percent) VALUES (?, ?, ?)
				 ON CONFLICT(recorded_at) DO UPDATE SET
				 weight_kg = excluded.weight_kg,
				 body_fat_percent = excluded.body_fat_percent`,
			);
			for (const m of body.body_measurements) {
				phase1.push(stmt.bind(m.recorded_at, m.weight_kg ?? null, m.body_fat_percent ?? null));
			}
		}

		if (body.blood_pressure?.length) {
			const stmt = db.prepare(
				`INSERT INTO blood_pressure (recorded_at, systolic, diastolic, pulse) VALUES (?, ?, ?, ?)
				 ON CONFLICT(recorded_at) DO UPDATE SET
				 systolic = excluded.systolic,
				 diastolic = excluded.diastolic,
				 pulse = excluded.pulse`,
			);
			for (const bp of body.blood_pressure) {
				phase1.push(stmt.bind(bp.recorded_at, bp.systolic, bp.diastolic, bp.pulse ?? null));
			}
		}

		if (body.steps?.length) {
			const stmt = db.prepare(
				`INSERT INTO steps (date, count) VALUES (?, ?)
				 ON CONFLICT(date) DO UPDATE SET count = excluded.count`,
			);
			for (const st of body.steps) {
				phase1.push(stmt.bind(st.date, st.count));
			}
		}

		if (body.heart_rate?.length) {
			const stmt = db.prepare(
				`INSERT INTO heart_rate (recorded_at, bpm) VALUES (?, ?)
				 ON CONFLICT(recorded_at) DO UPDATE SET bpm = excluded.bpm`,
			);
			for (const hr of body.heart_rate) {
				phase1.push(stmt.bind(hr.recorded_at, hr.bpm));
			}
		}

		if (body.resting_heart_rate?.length) {
			const stmt = db.prepare(
				`INSERT INTO resting_heart_rate (date, bpm) VALUES (?, ?)
				 ON CONFLICT(date) DO UPDATE SET bpm = excluded.bpm`,
			);
			for (const rhr of body.resting_heart_rate) {
				phase1.push(stmt.bind(rhr.date, rhr.bpm));
			}
		}

		if (body.spo2?.length) {
			const stmt = db.prepare(
				`INSERT INTO spo2 (recorded_at, percentage) VALUES (?, ?)
				 ON CONFLICT(recorded_at) DO UPDATE SET percentage = excluded.percentage`,
			);
			for (const sp of body.spo2) {
				phase1.push(stmt.bind(sp.recorded_at, sp.percentage));
			}
		}

		if (body.daily_activity?.length) {
			const stmt = db.prepare(
				`INSERT INTO daily_activity (date, active_calories_kcal, total_calories_kcal) VALUES (?, ?, ?)
				 ON CONFLICT(date) DO UPDATE SET
				 active_calories_kcal = excluded.active_calories_kcal,
				 total_calories_kcal = excluded.total_calories_kcal`,
			);
			for (const da of body.daily_activity) {
				phase1.push(stmt.bind(da.date, da.active_calories_kcal ?? null, da.total_calories_kcal ?? null));
			}
		}

		const sleepSessionStartIndex = phase1.length;
		if (body.sleep_sessions?.length) {
			const stmt = db.prepare(
				`INSERT INTO sleep_sessions (start_time, end_time, duration_hours) VALUES (?, ?, ?)
				 ON CONFLICT(start_time) DO UPDATE SET
				 end_time = excluded.end_time,
				 duration_hours = excluded.duration_hours
				 RETURNING id`,
			);
			for (const s of body.sleep_sessions) {
				phase1.push(stmt.bind(s.start_time, s.end_time, s.duration_hours ?? null));
			}
		}

		// d1.batch wraps all statements in a single implicit transaction:
		// any failure rolls back the whole sync.
		const phase1Results = phase1.length > 0 ? await db.batch<{ id: number }>(phase1) : [];

		// Phase 2: replace sleep_stages for sessions that included a stages[] field.
		// Skipped when the client omits stages[] (preserves existing rows on upsert).
		if (body.sleep_sessions?.length) {
			const stageStmts: D1PreparedStatement[] = [];
			const deleteStmt = db.prepare('DELETE FROM sleep_stages WHERE sleep_session_id = ?');
			const insertStmt = db.prepare('INSERT INTO sleep_stages (sleep_session_id, stage, start_time, end_time) VALUES (?, ?, ?, ?)');

			for (let i = 0; i < body.sleep_sessions.length; i++) {
				const session = body.sleep_sessions[i];
				if (!session.stages || session.stages.length === 0) continue;
				const idResult = phase1Results[sleepSessionStartIndex + i];
				const sessionId = idResult?.results?.[0]?.id;
				if (sessionId === undefined) continue;

				const merged = mergeConsecutiveStages(session.stages);
				stageStmts.push(deleteStmt.bind(sessionId));
				for (const stage of merged) {
					stageStmts.push(insertStmt.bind(sessionId, stage.stage, stage.start_time, stage.end_time));
				}
			}
			if (stageStmts.length > 0) {
				await db.batch(stageStmts);
			}
		}

		return jsonResponse({
			success: true,
			inserted: counts,
		});
	});
}

const CPAP_NUMERIC_FIELDS = [
	'ahi',
	'ai',
	'leak',
	'usage_hours',
	'ai_count',
	'hi_count',
	'csa_count',
	'snore_count',
	'ai_total_duration_sec',
	'hi_total_duration_sec',
	'pressure_min',
	'pressure_max',
	'pressure_mean',
	'pressure_median',
	'pressure_p90',
	'pressure_p95',
	'br_mean',
	'br_median',
	'tv_mean',
	'tv_median',
] as const;

async function handleCpap(request: Request, env: Env): Promise<Response> {
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	if (!isPlainObject(parsed)) {
		return errorResponse('Request body must be a JSON object', 400);
	}
	if (!parsed.recorded_date) {
		return errorResponse('recorded_date is required', 400);
	}
	if (typeof parsed.recorded_date !== 'string' || !DATE_FORMAT.test(parsed.recorded_date)) {
		return errorResponse('Invalid recorded_date format (must be YYYY-MM-DD)', 400);
	}
	const numericError = validateNumericFields(parsed, CPAP_NUMERIC_FIELDS);
	if (numericError) {
		return errorResponse(numericError, 400);
	}
	if (!isOptionalString(parsed.notes)) {
		return errorResponse('notes must be a string', 400);
	}
	const body = parsed as unknown as CpapLog;

	return withDbErrorHandling(async () => {
		await env.health_sync_db
			.prepare(
				`INSERT INTO cpap_logs (
					recorded_date, ahi, ai, leak, usage_hours, notes,
					ai_count, hi_count, csa_count, snore_count,
					ai_total_duration_sec, hi_total_duration_sec,
					pressure_min, pressure_max, pressure_mean, pressure_median, pressure_p90, pressure_p95,
					br_mean, br_median, tv_mean, tv_median
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(recorded_date) DO UPDATE SET
				 ahi = excluded.ahi,
				 ai = COALESCE(cpap_logs.ai, excluded.ai),
				 leak = excluded.leak,
				 usage_hours = excluded.usage_hours,
				 notes = COALESCE(cpap_logs.notes, excluded.notes),
				 ai_count = excluded.ai_count,
				 hi_count = excluded.hi_count,
				 csa_count = excluded.csa_count,
				 snore_count = excluded.snore_count,
				 ai_total_duration_sec = excluded.ai_total_duration_sec,
				 hi_total_duration_sec = excluded.hi_total_duration_sec,
				 pressure_min = excluded.pressure_min,
				 pressure_max = excluded.pressure_max,
				 pressure_mean = excluded.pressure_mean,
				 pressure_median = excluded.pressure_median,
				 pressure_p90 = excluded.pressure_p90,
				 pressure_p95 = excluded.pressure_p95,
				 br_mean = excluded.br_mean,
				 br_median = excluded.br_median,
				 tv_mean = excluded.tv_mean,
				 tv_median = excluded.tv_median`,
			)
			.bind(
				body.recorded_date,
				body.ahi ?? null,
				body.ai ?? null,
				body.leak ?? null,
				body.usage_hours ?? null,
				body.notes ?? null,
				body.ai_count ?? null,
				body.hi_count ?? null,
				body.csa_count ?? null,
				body.snore_count ?? null,
				body.ai_total_duration_sec ?? null,
				body.hi_total_duration_sec ?? null,
				body.pressure_min ?? null,
				body.pressure_max ?? null,
				body.pressure_mean ?? null,
				body.pressure_median ?? null,
				body.pressure_p90 ?? null,
				body.pressure_p95 ?? null,
				body.br_mean ?? null,
				body.br_median ?? null,
				body.tv_mean ?? null,
				body.tv_median ?? null,
			)
			.run();

		return jsonResponse({ success: true, recorded_date: body.recorded_date }, 201);
	});
}

const BLOOD_TEST_NUMERIC_FIELDS = ['glucose', 'hba1c', 'hdl', 'ldl', 'tg', 'ua', 'cr', 'egfr', 'ast', 'alt', 'gtp'] as const;

async function handleBloodTest(request: Request, env: Env): Promise<Response> {
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	if (!isPlainObject(parsed)) {
		return errorResponse('Request body must be a JSON object', 400);
	}
	if (!parsed.test_date) {
		return errorResponse('test_date is required', 400);
	}
	if (typeof parsed.test_date !== 'string' || !DATE_FORMAT.test(parsed.test_date)) {
		return errorResponse('Invalid test_date format (must be YYYY-MM-DD)', 400);
	}
	const numericError = validateNumericFields(parsed, BLOOD_TEST_NUMERIC_FIELDS);
	if (numericError) {
		return errorResponse(numericError, 400);
	}
	if (!isOptionalString(parsed.facility)) {
		return errorResponse('facility must be a string', 400);
	}
	const body = parsed as unknown as BloodTest;

	return withDbErrorHandling(async () => {
		await env.health_sync_db
			.prepare(
				`INSERT INTO blood_tests (test_date, facility, glucose, hba1c, hdl, ldl, tg, ua, cr, egfr, ast, alt, gtp)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(test_date) DO UPDATE SET
				 facility = excluded.facility,
				 glucose = excluded.glucose,
				 hba1c = excluded.hba1c,
				 hdl = excluded.hdl,
				 ldl = excluded.ldl,
				 tg = excluded.tg,
				 ua = excluded.ua,
				 cr = excluded.cr,
				 egfr = excluded.egfr,
				 ast = excluded.ast,
				 alt = excluded.alt,
				 gtp = excluded.gtp`,
			)
			.bind(
				body.test_date,
				body.facility ?? null,
				body.glucose ?? null,
				body.hba1c ?? null,
				body.hdl ?? null,
				body.ldl ?? null,
				body.tg ?? null,
				body.ua ?? null,
				body.cr ?? null,
				body.egfr ?? null,
				body.ast ?? null,
				body.alt ?? null,
				body.gtp ?? null,
			)
			.run();

		return jsonResponse({ success: true, test_date: body.test_date }, 201);
	});
}

async function handleGetBloodTest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const range = parseDateRangeParams(url);
	if (range.error) return range.error;

	return withDbErrorHandling(async () => {
		const { clause, params } = buildDateFilter('test_date', 'date', range);
		const query = `SELECT * FROM blood_tests${clause} ORDER BY test_date ASC`;
		const results = await env.health_sync_db
			.prepare(query)
			.bind(...params)
			.all();

		return jsonResponse({ blood_tests: results.results });
	});
}

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const MEAL_NUMERIC_FIELDS = ['calories_kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'salt_g'] as const;

async function handlePostMeal(request: Request, env: Env): Promise<Response> {
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	// バリデーション
	if (!isPlainObject(parsed)) {
		return errorResponse('Request body must be a JSON object', 400);
	}
	if (!parsed.date) {
		return errorResponse('date is required', 400);
	}
	if (typeof parsed.date !== 'string' || !DATE_FORMAT.test(parsed.date)) {
		return errorResponse('Invalid date format (must be YYYY-MM-DD)', 400);
	}
	if (!isNonEmptyString(parsed.meal_type) || !(VALID_MEAL_TYPES as readonly string[]).includes(parsed.meal_type)) {
		return errorResponse('meal_type must be one of: breakfast, lunch, dinner, snack', 400);
	}
	if (typeof parsed.description !== 'string' || parsed.description.trim() === '') {
		return errorResponse('description is required', 400);
	}
	const numericError = validateNumericFields(parsed, MEAL_NUMERIC_FIELDS);
	if (numericError) {
		return errorResponse(numericError, 400);
	}
	if (!isOptionalString(parsed.note)) {
		return errorResponse('note must be a string', 400);
	}
	const body = parsed as unknown as MealRecord;

	return withDbErrorHandling(async () => {
		await env.health_sync_db
			.prepare(
				`INSERT INTO meals (date, meal_type, description, calories_kcal, protein_g, fat_g, carbs_g, fiber_g, salt_g, note)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				 ON CONFLICT(date, meal_type) DO UPDATE SET
				 description = excluded.description,
				 calories_kcal = excluded.calories_kcal,
				 protein_g = excluded.protein_g,
				 fat_g = excluded.fat_g,
				 carbs_g = excluded.carbs_g,
				 fiber_g = excluded.fiber_g,
				 salt_g = excluded.salt_g,
				 note = excluded.note`,
			)
			.bind(
				body.date,
				body.meal_type,
				body.description.trim(),
				body.calories_kcal ?? null,
				body.protein_g ?? null,
				body.fat_g ?? null,
				body.carbs_g ?? null,
				body.fiber_g ?? null,
				body.salt_g ?? null,
				body.note ?? null,
			)
			.run();

		return jsonResponse({ success: true, date: body.date, meal_type: body.meal_type }, 201);
	});
}

async function handleGetMeals(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const range = parseDateRangeParams(url, 7);
	if (range.error) return range.error;

	return withDbErrorHandling(async () => {
		const { clause, params } = buildDateFilter('date', 'date', range);
		const query = `SELECT * FROM meals${clause} ORDER BY date ASC,
			CASE meal_type
				WHEN 'breakfast' THEN 1
				WHEN 'lunch' THEN 2
				WHEN 'dinner' THEN 3
				WHEN 'snack' THEN 4
			END ASC`;
		const results = await env.health_sync_db
			.prepare(query)
			.bind(...params)
			.all();

		return jsonResponse({ meals: results.results });
	});
}

async function handleMetrics(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const range = parseDateRangeParams(url, 7);
	if (range.error) return range.error;

	return withDbErrorHandling(async () => {
		const bmFilter = buildDateFilter('recorded_at', 'datetime', range);
		const bpFilter = buildDateFilter('recorded_at', 'datetime', range);
		const ssFilter = buildDateFilter('start_time', 'datetime', range);
		const stFilter = buildDateFilter('date', 'date', range);
		const cpFilter = buildDateFilter('recorded_date', 'date', range);
		const btFilter = buildDateFilter('test_date', 'date', range);
		const hrFilter = buildDateFilter('recorded_at', 'datetime', range);
		const rhrFilter = buildDateFilter('date', 'date', range);
		const spo2Filter = buildDateFilter('recorded_at', 'datetime', range);
		const daFilter = buildDateFilter('date', 'date', range);

		const [bodyMeasurements, bloodPressure, sleepSessions, steps, cpapLogs, bloodTests, heartRate, restingHeartRate, spo2, dailyActivity] =
			await Promise.all([
				env.health_sync_db
					.prepare(`SELECT * FROM body_measurements${bmFilter.clause} ORDER BY recorded_at DESC`)
					.bind(...bmFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM blood_pressure${bpFilter.clause} ORDER BY recorded_at DESC`)
					.bind(...bpFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM sleep_sessions${ssFilter.clause} ORDER BY start_time DESC`)
					.bind(...ssFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM steps${stFilter.clause} ORDER BY date DESC`)
					.bind(...stFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM cpap_logs${cpFilter.clause} ORDER BY recorded_date DESC`)
					.bind(...cpFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM blood_tests${btFilter.clause} ORDER BY test_date DESC`)
					.bind(...btFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM heart_rate${hrFilter.clause} ORDER BY recorded_at DESC`)
					.bind(...hrFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM resting_heart_rate${rhrFilter.clause} ORDER BY date DESC`)
					.bind(...rhrFilter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM spo2${spo2Filter.clause} ORDER BY recorded_at DESC`)
					.bind(...spo2Filter.params)
					.all(),
				env.health_sync_db
					.prepare(`SELECT * FROM daily_activity${daFilter.clause} ORDER BY date DESC`)
					.bind(...daFilter.params)
					.all(),
			]);

		const sessionRows = sleepSessions.results as Record<string, unknown>[];
		const stagesBySessionId = new Map<number, Array<{ stage: string; start_time: string; end_time: string }>>();

		if (sessionRows.length > 0) {
			const sessionIds = sessionRows.map((s) => s.id as number);
			// D1 caps bound parameters at 100 per query, so the IN list is chunked.
			// Each session's stages land entirely in one chunk, so the per-session
			// start_time ASC ordering survives the split.
			const CHUNK_SIZE = 100;
			const chunks: number[][] = [];
			for (let i = 0; i < sessionIds.length; i += CHUNK_SIZE) {
				chunks.push(sessionIds.slice(i, i + CHUNK_SIZE));
			}
			const stageResults = await Promise.all(
				chunks.map((ids) =>
					env.health_sync_db
						.prepare(
							`SELECT sleep_session_id, stage, start_time, end_time
							 FROM sleep_stages
							 WHERE sleep_session_id IN (${ids.map(() => '?').join(',')})
							 ORDER BY start_time ASC`,
						)
						.bind(...ids)
						.all<{
							sleep_session_id: number;
							stage: string;
							start_time: string;
							end_time: string;
						}>(),
				),
			);

			for (const result of stageResults) {
				for (const row of result.results) {
					const list = stagesBySessionId.get(row.sleep_session_id) ?? [];
					list.push({ stage: row.stage, start_time: row.start_time, end_time: row.end_time });
					stagesBySessionId.set(row.sleep_session_id, list);
				}
			}
		}

		const sleepSessionsWithStages = sessionRows.map((session) => ({
			...session,
			stages: stagesBySessionId.get(session.id as number) ?? [],
		}));

		return jsonResponse({
			body_measurements: bodyMeasurements.results,
			blood_pressure: bloodPressure.results,
			sleep_sessions: sleepSessionsWithStages,
			steps: steps.results,
			cpap_logs: cpapLogs.results,
			blood_tests: bloodTests.results,
			heart_rate: heartRate.results,
			resting_heart_rate: restingHeartRate.results,
			spo2: spo2.results,
			daily_activity: dailyActivity.results,
		});
	});
}

type RouteHandler = (request: Request, env: Env) => Promise<Response>;
type Route = { method: string; path: string; auth: boolean; handler: RouteHandler };

const routes: Route[] = [
	{ method: 'GET', path: '/health', auth: false, handler: handleHealth },
	{ method: 'POST', path: '/sync', auth: true, handler: handleSync },
	{ method: 'GET', path: '/metrics', auth: true, handler: handleMetrics },
	{ method: 'POST', path: '/cpap', auth: true, handler: handleCpap },
	{ method: 'POST', path: '/blood-test', auth: true, handler: handleBloodTest },
	{ method: 'GET', path: '/blood-test', auth: true, handler: handleGetBloodTest },
	{ method: 'POST', path: '/meals', auth: true, handler: handlePostMeal },
	{ method: 'GET', path: '/meals', auth: true, handler: handleGetMeals },
];

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		try {
			const route = routes.find((r) => r.path === path && r.method === request.method);
			if (!route) return errorResponse('Not found', 404);

			if (route.auth) {
				const authError = authenticate(request, env);
				if (authError) return authError;
			}
			return route.handler(request, env);
		} catch (error) {
			console.error('Unhandled error:', error);
			const isDbError = error instanceof Error && (error.message.includes('D1') || error.message.includes('SQLITE'));
			return errorResponse(isDbError ? 'Database operation failed' : 'Internal server error', 500);
		}
	},
} satisfies ExportedHandler<Env>;
