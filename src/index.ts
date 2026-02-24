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

interface SyncRequest {
	body_measurements?: BodyMeasurement[];
	blood_pressure?: BloodPressure[];
	sleep_sessions?: SleepSession[];
	steps?: Steps[];
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

function daysAgoDate(days: number): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() - days);
	return date.toISOString().split('T')[0];
}

function parseDateRangeParams(
	url: URL,
	defaultDays?: number
): { from?: string; to?: string; error?: Response } {
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
		const days = parseInt(daysParam, 10);
		if (isNaN(days) || days < 1) {
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

function buildDateFilter(
	column: string,
	type: 'date' | 'datetime',
	range: { from?: string; to?: string }
): { clause: string; params: string[] } {
	const conditions: string[] = [];
	const params: string[] = [];

	if (range.from) {
		conditions.push(`${column} >= ?`);
		params.push(type === 'datetime' ? `${range.from} 00:00:00` : range.from);
	}

	if (range.to) {
		conditions.push(`${column} <= ?`);
		params.push(type === 'datetime' ? `${range.to} 23:59:59` : range.to);
	}

	const clause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
	return { clause, params };
}

function authenticate(request: Request, env: Env): Response | null {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return errorResponse('Unauthorized', 401);
	}
	const token = authHeader.slice(7);
	if (token !== env.API_KEY) {
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
	if (request.method !== 'POST') {
		return errorResponse('Method not allowed', 405);
	}

	let body: SyncRequest;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	const results = {
		body_measurements: 0,
		blood_pressure: 0,
		sleep_sessions: 0,
		steps: 0,
	};

	try {
		// Insert body measurements
		if (body.body_measurements && body.body_measurements.length > 0) {
			for (const m of body.body_measurements) {
				await env.health_sync_db
					.prepare(
						`INSERT INTO body_measurements (recorded_at, weight_kg, body_fat_percent) VALUES (?, ?, ?)
						 ON CONFLICT(recorded_at) DO UPDATE SET
						 weight_kg = excluded.weight_kg,
						 body_fat_percent = excluded.body_fat_percent`
					)
					.bind(m.recorded_at, m.weight_kg ?? null, m.body_fat_percent ?? null)
					.run();
				results.body_measurements++;
			}
		}

		// Insert blood pressure
		if (body.blood_pressure && body.blood_pressure.length > 0) {
			for (const bp of body.blood_pressure) {
				await env.health_sync_db
					.prepare(
						`INSERT INTO blood_pressure (recorded_at, systolic, diastolic, pulse) VALUES (?, ?, ?, ?)
						 ON CONFLICT(recorded_at) DO UPDATE SET
						 systolic = excluded.systolic,
						 diastolic = excluded.diastolic,
						 pulse = excluded.pulse`
					)
					.bind(bp.recorded_at, bp.systolic, bp.diastolic, bp.pulse ?? null)
					.run();
				results.blood_pressure++;
			}
		}

		// Insert sleep sessions
		if (body.sleep_sessions && body.sleep_sessions.length > 0) {
			for (const s of body.sleep_sessions) {
				await env.health_sync_db
					.prepare(
						`INSERT INTO sleep_sessions (start_time, end_time, duration_hours) VALUES (?, ?, ?)
						 ON CONFLICT(start_time) DO UPDATE SET
						 end_time = excluded.end_time,
						 duration_hours = excluded.duration_hours`
					)
					.bind(s.start_time, s.end_time, s.duration_hours ?? null)
					.run();

				if (s.stages && s.stages.length > 0) {
					const session = await env.health_sync_db
						.prepare('SELECT id FROM sleep_sessions WHERE start_time = ?')
						.bind(s.start_time)
						.first<{ id: number }>();

					if (session) {
						await env.health_sync_db
							.prepare('DELETE FROM sleep_stages WHERE sleep_session_id = ?')
							.bind(session.id)
							.run();

						for (const stage of s.stages) {
							await env.health_sync_db
								.prepare(
									'INSERT INTO sleep_stages (sleep_session_id, stage, start_time, end_time) VALUES (?, ?, ?, ?)'
								)
								.bind(session.id, stage.stage, stage.start_time, stage.end_time)
								.run();
						}
					}
				}

				results.sleep_sessions++;
			}
		}

		// Insert steps
		if (body.steps && body.steps.length > 0) {
			for (const st of body.steps) {
				await env.health_sync_db
					.prepare(
						`INSERT INTO steps (date, count) VALUES (?, ?)
						 ON CONFLICT(date) DO UPDATE SET
						 count = excluded.count`
					)
					.bind(st.date, st.count)
					.run();
				results.steps++;
			}
		}
	} catch (error) {
		console.error('Sync DB error:', error);
		return errorResponse('Database operation failed', 500, { inserted: results });
	}

	return jsonResponse({
		success: true,
		inserted: results,
	});
}

async function handleCpap(request: Request, env: Env): Promise<Response> {
	let body: CpapLog;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	if (!body.recorded_date) {
		return errorResponse('recorded_date is required', 400);
	}

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
				 tv_median = excluded.tv_median`
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
				body.tv_median ?? null
			)
			.run();

		return jsonResponse({ success: true, recorded_date: body.recorded_date }, 201);
	});
}

async function handleBloodTest(request: Request, env: Env): Promise<Response> {
	let body: BloodTest;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	if (!body.test_date) {
		return errorResponse('test_date is required', 400);
	}

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
				 gtp = excluded.gtp`
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
				body.gtp ?? null
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

async function handlePostMeal(request: Request, env: Env): Promise<Response> {
	let body: MealRecord;
	try {
		body = await request.json();
	} catch {
		return errorResponse('Invalid JSON body', 400);
	}

	// バリデーション
	if (!body.date) {
		return errorResponse('date is required', 400);
	}
	if (!DATE_FORMAT.test(body.date)) {
		return errorResponse('Invalid date format (must be YYYY-MM-DD)', 400);
	}
	if (!body.meal_type || !VALID_MEAL_TYPES.includes(body.meal_type as any)) {
		return errorResponse('meal_type must be one of: breakfast, lunch, dinner, snack', 400);
	}
	if (!body.description || body.description.trim() === '') {
		return errorResponse('description is required', 400);
	}

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
				 note = excluded.note`
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
				body.note ?? null
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

		const [bodyMeasurements, bloodPressure, sleepSessions, steps, cpapLogs, bloodTests] =
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
			]);

		const sleepSessionsWithStages = await Promise.all(
			(sleepSessions.results as Record<string, unknown>[]).map(async (session) => {
				const stages = await env.health_sync_db
					.prepare('SELECT stage, start_time, end_time FROM sleep_stages WHERE sleep_session_id = ? ORDER BY start_time ASC')
					.bind(session.id)
					.all();
				return { ...session, stages: stages.results };
			})
		);

		return jsonResponse({
			body_measurements: bodyMeasurements.results,
			blood_pressure: bloodPressure.results,
			sleep_sessions: sleepSessionsWithStages,
			steps: steps.results,
			cpap_logs: cpapLogs.results,
			blood_tests: bloodTests.results,
		});
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		try {
			if (path === '/health' && request.method === 'GET') {
				return handleHealth();
			}

			if (path === '/sync' && request.method === 'POST') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleSync(request, env);
			}

			if (path === '/metrics' && request.method === 'GET') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleMetrics(request, env);
			}

			if (path === '/cpap' && request.method === 'POST') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleCpap(request, env);
			}

			if (path === '/blood-test' && request.method === 'POST') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleBloodTest(request, env);
			}

			if (path === '/blood-test' && request.method === 'GET') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleGetBloodTest(request, env);
			}

			if (path === '/meals' && request.method === 'POST') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handlePostMeal(request, env);
			}

			if (path === '/meals' && request.method === 'GET') {
				const authError = authenticate(request, env);
				if (authError) return authError;
				return handleGetMeals(request, env);
			}

			return errorResponse('Not found', 404);
		} catch (error) {
			console.error('Unhandled error:', error);
			const isDbError = error instanceof Error &&
				(error.message.includes('D1') || error.message.includes('SQLITE'));
			return errorResponse(
				isDbError ? 'Database operation failed' : 'Internal server error',
				500
			);
		}
	},
} satisfies ExportedHandler<Env>;
