interface Env {
	health_sync_db: D1Database;
	API_KEY: string;
}

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

interface SleepSession {
	start_time: string;
	end_time: string;
	duration_hours?: number;
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

function errorResponse(message: string, status: number): Response {
	return jsonResponse({ error: message }, status);
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

	await env.health_sync_db
		.prepare(
			`INSERT INTO cpap_logs (recorded_date, ahi, ai, leak, usage_hours, notes)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(recorded_date) DO UPDATE SET
			 ahi = excluded.ahi,
			 ai = excluded.ai,
			 leak = excluded.leak,
			 usage_hours = excluded.usage_hours,
			 notes = excluded.notes`
		)
		.bind(
			body.recorded_date,
			body.ahi ?? null,
			body.ai ?? null,
			body.leak ?? null,
			body.usage_hours ?? null,
			body.notes ?? null
		)
		.run();

	return jsonResponse({ success: true, recorded_date: body.recorded_date }, 201);
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
}

async function handleGetBloodTest(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const daysParam = url.searchParams.get('days');

	// days パラメータなしの場合は全件返す
	if (!daysParam) {
		const results = await env.health_sync_db
			.prepare(`SELECT * FROM blood_tests ORDER BY test_date ASC`)
			.all();
		return jsonResponse({ blood_tests: results.results });
	}

	const days = parseInt(daysParam, 10);
	if (isNaN(days) || days < 1 || days > 365) {
		return errorResponse('Invalid days parameter (must be 1-365)', 400);
	}

	const dateFilter = `-${days} days`;
	const results = await env.health_sync_db
		.prepare(
			`SELECT * FROM blood_tests WHERE test_date >= date('now', ?) ORDER BY test_date ASC`
		)
		.bind(dateFilter)
		.all();

	return jsonResponse({ blood_tests: results.results });
}

async function handleMetrics(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const days = parseInt(url.searchParams.get('days') || '7', 10);

	if (isNaN(days) || days < 1 || days > 365) {
		return errorResponse('Invalid days parameter (must be 1-365)', 400);
	}

	const dateFilter = `-${days} days`;

	const [bodyMeasurements, bloodPressure, sleepSessions, steps, cpapLogs, bloodTests] =
		await Promise.all([
			env.health_sync_db
				.prepare(
					`SELECT * FROM body_measurements WHERE recorded_at >= datetime('now', ?) ORDER BY recorded_at DESC`
				)
				.bind(dateFilter)
				.all(),
			env.health_sync_db
				.prepare(
					`SELECT * FROM blood_pressure WHERE recorded_at >= datetime('now', ?) ORDER BY recorded_at DESC`
				)
				.bind(dateFilter)
				.all(),
			env.health_sync_db
				.prepare(
					`SELECT * FROM sleep_sessions WHERE start_time >= datetime('now', ?) ORDER BY start_time DESC`
				)
				.bind(dateFilter)
				.all(),
			env.health_sync_db
				.prepare(
					`SELECT * FROM steps WHERE date >= date('now', ?) ORDER BY date DESC`
				)
				.bind(dateFilter)
				.all(),
			env.health_sync_db
				.prepare(
					`SELECT * FROM cpap_logs WHERE recorded_date >= date('now', ?) ORDER BY recorded_date DESC`
				)
				.bind(dateFilter)
				.all(),
			env.health_sync_db
				.prepare(
					`SELECT * FROM blood_tests WHERE test_date >= date('now', ?) ORDER BY test_date DESC`
				)
				.bind(dateFilter)
				.all(),
		]);

	return jsonResponse({
		body_measurements: bodyMeasurements.results,
		blood_pressure: bloodPressure.results,
		sleep_sessions: sleepSessions.results,
		steps: steps.results,
		cpap_logs: cpapLogs.results,
		blood_tests: bloodTests.results,
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

			return errorResponse('Not found', 404);
		} catch (error) {
			console.error('Error:', error);
			const message =
				error instanceof Error ? error.message : 'Internal server error';
			return errorResponse(message, 500);
		}
	},
} satisfies ExportedHandler<Env>;
