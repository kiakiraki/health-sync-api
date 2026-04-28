import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createAuthHeaders, makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

describe('Health Sync API', () => {
	describe('GET /health', () => {
		it('returns status ok without authentication', async () => {
			const response = await makeRequest('/health');
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.status).toBe('ok');
			expect(data.timestamp).toBeDefined();
		});
	});

	describe('POST /blood-test', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-01-01' },
				headers: { 'Content-Type': 'application/json' },
			});
			expect(response.status).toBe(401);
		});

		it('returns 400 for invalid JSON', async () => {
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				headers: createAuthHeaders(),
				rawBody: 'invalid json',
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid JSON body');
		});

		it('returns 400 when test_date is missing', async () => {
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				body: { glucose: 95 },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('test_date is required');
		});

		it('creates blood test record with valid data', async () => {
			const testDate = '2020-02-05';
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				body: {
					test_date: testDate,
					facility: 'Test Clinic',
					glucose: 95,
					hba1c: 5.6,
					hdl: 55,
					ldl: 120,
					tg: 100,
					ua: 5.5,
					cr: 0.9,
					egfr: 85,
					ast: 25,
					alt: 20,
					gtp: 30,
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.test_date).toBe(testDate);

			// Verify data was stored
			const result = await env.health_sync_db.prepare('SELECT * FROM blood_tests WHERE test_date = ?').bind(testDate).first();
			expect(result).not.toBeNull();
			expect(result!.glucose).toBe(95);
			expect(result!.hba1c).toBe(5.6);
			expect(result!.facility).toBe('Test Clinic');
		});

		it('updates existing record on conflict (upsert)', async () => {
			const testDate = '2020-03-15';

			// Insert initial record
			await makeRequest('/blood-test', {
				method: 'POST',
				body: {
					test_date: testDate,
					glucose: 95,
					hba1c: 5.6,
				},
				headers: createAuthHeaders(),
			});

			// Update with same test_date
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				body: {
					test_date: testDate,
					glucose: 100,
					hba1c: 5.8,
					ldl: 130,
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);

			// Verify record was updated
			const result = await env.health_sync_db.prepare('SELECT * FROM blood_tests WHERE test_date = ?').bind(testDate).first();
			expect(result!.glucose).toBe(100);
			expect(result!.hba1c).toBe(5.8);
			expect(result!.ldl).toBe(130);
		});

		it('creates record with only required field', async () => {
			const testDate = '2020-04-20';
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: testDate },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);

			const result = await env.health_sync_db.prepare('SELECT * FROM blood_tests WHERE test_date = ?').bind(testDate).first();
			expect(result).not.toBeNull();
			expect(result!.glucose).toBeNull();
		});
	});

	describe('GET /blood-test', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/blood-test');
			expect(response.status).toBe(401);
		});

		it('returns all blood tests without days parameter', async () => {
			// Insert test data via API
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-05-10', glucose: 95 },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/blood-test', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.blood_tests).toBeDefined();
			expect(Array.isArray(data.blood_tests)).toBe(true);
		});

		it('filters by days parameter when provided', async () => {
			const response = await makeRequest('/blood-test?days=30', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.blood_tests).toBeDefined();
		});

		it('returns 400 for invalid days parameter (0)', async () => {
			const response = await makeRequest('/blood-test?days=0', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid days parameter (must be a positive integer)');
		});

		it('accepts days > 365 (no upper limit)', async () => {
			const response = await makeRequest('/blood-test?days=730', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});

		it('returns 400 for non-numeric days', async () => {
			const response = await makeRequest('/blood-test?days=abc', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('returns 400 for partially-numeric days like "7abc"', async () => {
			const response = await makeRequest('/blood-test?days=7abc', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid days parameter (must be a positive integer)');
		});

		it('filters by from parameter', async () => {
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-01-15', glucose: 90 },
				headers: createAuthHeaders(),
			});
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-06-15', glucose: 95 },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/blood-test?from=2020-03-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.blood_tests.every((t: AnyJson) => t.test_date >= '2020-03-01')).toBe(true);
		});

		it('filters by to parameter', async () => {
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-01-10', glucose: 88 },
				headers: createAuthHeaders(),
			});
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-12-25', glucose: 100 },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/blood-test?to=2020-06-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.blood_tests.every((t: AnyJson) => t.test_date <= '2020-06-01')).toBe(true);
		});

		it('filters by from and to parameters', async () => {
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-02-01', glucose: 85 },
				headers: createAuthHeaders(),
			});
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-04-01', glucose: 92 },
				headers: createAuthHeaders(),
			});
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-08-01', glucose: 98 },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/blood-test?from=2020-03-01&to=2020-05-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.blood_tests.every((t: AnyJson) => t.test_date >= '2020-03-01' && t.test_date <= '2020-05-01')).toBe(true);
		});

		it('from/to takes priority over days', async () => {
			const response = await makeRequest('/blood-test?from=2020-01-01&to=2020-12-31&days=1', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});

		it('returns 400 for invalid from format', async () => {
			const response = await makeRequest('/blood-test?from=abc', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid from parameter (must be YYYY-MM-DD)');
		});

		it('returns 400 for invalid to format', async () => {
			const response = await makeRequest('/blood-test?to=2022/01/01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid to parameter (must be YYYY-MM-DD)');
		});

		it('returns 400 when from is after to', async () => {
			const response = await makeRequest('/blood-test?from=2020-12-01&to=2020-01-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('from must not be after to');
		});
	});

	describe('GET /metrics', () => {
		it('includes blood_tests in response', async () => {
			// Insert blood test data via API
			await makeRequest('/blood-test', {
				method: 'POST',
				body: { test_date: '2020-06-15', glucose: 95, hba1c: 5.6 },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?days=365', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			expect(data.blood_tests).toBeDefined();
			expect(Array.isArray(data.blood_tests)).toBe(true);
		});

		it('returns sleep stages nested in sleep_sessions', async () => {
			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: '2020-08-01T23:00:00Z',
							end_time: '2020-08-02T07:00:00Z',
							duration_hours: 8.0,
							stages: [
								{ stage: 'light', start_time: '2020-08-01T23:00:00Z', end_time: '2020-08-01T23:45:00Z' },
								{ stage: 'deep', start_time: '2020-08-01T23:45:00Z', end_time: '2020-08-02T01:00:00Z' },
							],
						},
					],
				},
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?from=2020-08-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			const session = data.sleep_sessions.find((s: AnyJson) => s.start_time === '2020-08-01T23:00:00Z');
			expect(session).toBeDefined();
			expect(session.stages).toBeDefined();
			expect(session.stages.length).toBe(2);
			expect(session.stages[0].stage).toBe('light');
			expect(session.stages[1].stage).toBe('deep');
		});

		it('returns empty stages array for sleep sessions without stages', async () => {
			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: '2020-08-05T22:00:00Z',
							end_time: '2020-08-06T06:00:00Z',
							duration_hours: 8.0,
						},
					],
				},
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?from=2020-08-05', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			const session = data.sleep_sessions.find((s: AnyJson) => s.start_time === '2020-08-05T22:00:00Z');
			expect(session).toBeDefined();
			expect(session.stages).toBeDefined();
			expect(session.stages).toEqual([]);
		});

		it('returns all health data types', async () => {
			const response = await makeRequest('/metrics?days=7', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			expect(data).toHaveProperty('body_measurements');
			expect(data).toHaveProperty('blood_pressure');
			expect(data).toHaveProperty('sleep_sessions');
			expect(data).toHaveProperty('steps');
			expect(data).toHaveProperty('cpap_logs');
			expect(data).toHaveProperty('blood_tests');
		});

		it('accepts days > 365 (no upper limit)', async () => {
			const response = await makeRequest('/metrics?days=730', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});

		it('returns 400 for invalid days parameter', async () => {
			const response = await makeRequest('/metrics?days=0', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('returns 400 for non-numeric days', async () => {
			const response = await makeRequest('/metrics?days=abc', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('supports from parameter', async () => {
			const response = await makeRequest('/metrics?from=2020-01-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data).toHaveProperty('body_measurements');
		});

		it('supports to parameter', async () => {
			const response = await makeRequest('/metrics?to=2020-12-31', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});

		it('supports from and to parameters', async () => {
			const response = await makeRequest('/metrics?from=2020-01-01&to=2020-12-31', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});

		it('to= includes ISO datetime rows recorded on the to date (boundary)', async () => {
			// Bug regression: ISO 'T' separator > space in ASCII collation, so
			// `recorded_at <= 'YYYY-MM-DD 23:59:59'` used to drop same-day rows.
			await makeRequest('/sync', {
				method: 'POST',
				body: {
					body_measurements: [
						{ recorded_at: '2020-10-15T23:30:00Z', weight_kg: 70.0 },
						{ recorded_at: '2020-10-15T00:00:00Z', weight_kg: 70.5 },
					],
					blood_pressure: [{ recorded_at: '2020-10-15T22:00:00Z', systolic: 120, diastolic: 80 }],
					sleep_sessions: [{ start_time: '2020-10-15T23:00:00Z', end_time: '2020-10-16T07:00:00Z', duration_hours: 8.0 }],
				},
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?from=2020-10-15&to=2020-10-15', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			const bm = data.body_measurements.filter((r: AnyJson) => r.recorded_at.startsWith('2020-10-15'));
			expect(bm.length).toBe(2);
			expect(data.blood_pressure.some((r: AnyJson) => r.recorded_at === '2020-10-15T22:00:00Z')).toBe(true);
			expect(data.sleep_sessions.some((r: AnyJson) => r.start_time === '2020-10-15T23:00:00Z')).toBe(true);
		});

		it('returns 400 for invalid from format', async () => {
			const response = await makeRequest('/metrics?from=invalid', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('returns 400 when from is after to', async () => {
			const response = await makeRequest('/metrics?from=2020-12-01&to=2020-01-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('from/to ignores days parameter', async () => {
			const response = await makeRequest('/metrics?from=2020-01-01&to=2020-12-31&days=1', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
		});
	});

	describe('POST /sync', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {},
				headers: { 'Content-Type': 'application/json' },
			});
			expect(response.status).toBe(401);
		});

		it('syncs sleep sessions with stages', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: '2020-07-10T23:00:00Z',
							end_time: '2020-07-11T07:00:00Z',
							duration_hours: 8.0,
							stages: [
								{ stage: 'light', start_time: '2020-07-10T23:00:00Z', end_time: '2020-07-10T23:30:00Z' },
								{ stage: 'deep', start_time: '2020-07-10T23:30:00Z', end_time: '2020-07-11T00:30:00Z' },
								{ stage: 'rem', start_time: '2020-07-11T00:30:00Z', end_time: '2020-07-11T01:00:00Z' },
								{ stage: 'awake', start_time: '2020-07-11T01:00:00Z', end_time: '2020-07-11T01:05:00Z' },
							],
						},
					],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.inserted.sleep_sessions).toBe(1);

			const session = await env.health_sync_db
				.prepare('SELECT id FROM sleep_sessions WHERE start_time = ?')
				.bind('2020-07-10T23:00:00Z')
				.first<{ id: number }>();
			expect(session).not.toBeNull();

			const stages = await env.health_sync_db
				.prepare('SELECT * FROM sleep_stages WHERE sleep_session_id = ? ORDER BY start_time ASC')
				.bind(session!.id)
				.all();
			expect(stages.results.length).toBe(4);
			expect(stages.results[0].stage).toBe('light');
			expect(stages.results[1].stage).toBe('deep');
			expect(stages.results[2].stage).toBe('rem');
			expect(stages.results[3].stage).toBe('awake');
		});

		it('merges consecutive same-type stages', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: '2020-07-20T23:00:00Z',
							end_time: '2020-07-21T07:00:00Z',
							duration_hours: 8.0,
							stages: [
								{ stage: 'light', start_time: '2020-07-20T23:00:00Z', end_time: '2020-07-20T23:01:00Z' },
								{ stage: 'light', start_time: '2020-07-20T23:01:00Z', end_time: '2020-07-20T23:02:00Z' },
								{ stage: 'light', start_time: '2020-07-20T23:02:00Z', end_time: '2020-07-20T23:03:00Z' },
								{ stage: 'deep', start_time: '2020-07-20T23:03:00Z', end_time: '2020-07-20T23:04:00Z' },
								{ stage: 'deep', start_time: '2020-07-20T23:04:00Z', end_time: '2020-07-20T23:05:00Z' },
								{ stage: 'light', start_time: '2020-07-20T23:05:00Z', end_time: '2020-07-20T23:06:00Z' },
								{ stage: 'rem', start_time: '2020-07-20T23:06:00Z', end_time: '2020-07-20T23:07:00Z' },
								{ stage: 'rem', start_time: '2020-07-20T23:07:00Z', end_time: '2020-07-20T23:08:00Z' },
								{ stage: 'rem', start_time: '2020-07-20T23:08:00Z', end_time: '2020-07-20T23:09:00Z' },
							],
						},
					],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);

			const session = await env.health_sync_db
				.prepare('SELECT id FROM sleep_sessions WHERE start_time = ?')
				.bind('2020-07-20T23:00:00Z')
				.first<{ id: number }>();

			const stages = await env.health_sync_db
				.prepare('SELECT * FROM sleep_stages WHERE sleep_session_id = ? ORDER BY start_time ASC')
				.bind(session!.id)
				.all();

			// 9 raw stages → 4 merged stages (light, deep, light, rem)
			expect(stages.results.length).toBe(4);
			expect(stages.results[0].stage).toBe('light');
			expect(stages.results[0].start_time).toBe('2020-07-20T23:00:00Z');
			expect(stages.results[0].end_time).toBe('2020-07-20T23:03:00Z');
			expect(stages.results[1].stage).toBe('deep');
			expect(stages.results[1].start_time).toBe('2020-07-20T23:03:00Z');
			expect(stages.results[1].end_time).toBe('2020-07-20T23:05:00Z');
			expect(stages.results[2].stage).toBe('light');
			expect(stages.results[2].start_time).toBe('2020-07-20T23:05:00Z');
			expect(stages.results[2].end_time).toBe('2020-07-20T23:06:00Z');
			expect(stages.results[3].stage).toBe('rem');
			expect(stages.results[3].start_time).toBe('2020-07-20T23:06:00Z');
			expect(stages.results[3].end_time).toBe('2020-07-20T23:09:00Z');
		});

		it('syncs sleep sessions without stages (backward compatibility)', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: '2020-07-12T22:00:00Z',
							end_time: '2020-07-13T06:00:00Z',
							duration_hours: 8.0,
						},
					],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.inserted.sleep_sessions).toBe(1);
		});

		it('replaces stages on sleep session upsert', async () => {
			const startTime = '2020-07-15T23:00:00Z';

			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: startTime,
							end_time: '2020-07-16T07:00:00Z',
							duration_hours: 8.0,
							stages: [
								{ stage: 'light', start_time: '2020-07-15T23:00:00Z', end_time: '2020-07-15T23:30:00Z' },
								{ stage: 'deep', start_time: '2020-07-15T23:30:00Z', end_time: '2020-07-16T00:00:00Z' },
							],
						},
					],
				},
				headers: createAuthHeaders(),
			});

			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: startTime,
							end_time: '2020-07-16T07:30:00Z',
							duration_hours: 8.5,
							stages: [{ stage: 'rem', start_time: '2020-07-15T23:00:00Z', end_time: '2020-07-16T00:00:00Z' }],
						},
					],
				},
				headers: createAuthHeaders(),
			});

			const session = await env.health_sync_db
				.prepare('SELECT id FROM sleep_sessions WHERE start_time = ?')
				.bind(startTime)
				.first<{ id: number }>();

			const stages = await env.health_sync_db.prepare('SELECT * FROM sleep_stages WHERE sleep_session_id = ?').bind(session!.id).all();
			expect(stages.results.length).toBe(1);
			expect(stages.results[0].stage).toBe('rem');
		});

		it('preserves existing stages when stages not provided in upsert', async () => {
			const startTime = '2020-07-18T22:00:00Z';

			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: startTime,
							end_time: '2020-07-19T06:00:00Z',
							duration_hours: 8.0,
							stages: [{ stage: 'deep', start_time: '2020-07-18T22:00:00Z', end_time: '2020-07-18T23:00:00Z' }],
						},
					],
				},
				headers: createAuthHeaders(),
			});

			await makeRequest('/sync', {
				method: 'POST',
				body: {
					sleep_sessions: [
						{
							start_time: startTime,
							end_time: '2020-07-19T06:30:00Z',
							duration_hours: 8.5,
						},
					],
				},
				headers: createAuthHeaders(),
			});

			const session = await env.health_sync_db
				.prepare('SELECT id FROM sleep_sessions WHERE start_time = ?')
				.bind(startTime)
				.first<{ id: number }>();

			const stages = await env.health_sync_db.prepare('SELECT * FROM sleep_stages WHERE sleep_session_id = ?').bind(session!.id).all();
			expect(stages.results.length).toBe(1);
			expect(stages.results[0].stage).toBe('deep');
		});

		it('syncs body measurements', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					body_measurements: [{ recorded_at: '2020-07-05T10:00:00Z', weight_kg: 70.5, body_fat_percent: 20 }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.inserted.body_measurements).toBe(1);
		});
	});

	describe('POST /cpap', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/cpap', {
				method: 'POST',
				body: { recorded_date: '2020-08-10' },
				headers: { 'Content-Type': 'application/json' },
			});
			expect(response.status).toBe(401);
		});

		it('creates cpap log with valid data', async () => {
			const response = await makeRequest('/cpap', {
				method: 'POST',
				body: {
					recorded_date: '2020-08-15',
					ahi: 2.5,
					usage_hours: 7.5,
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
		});

		it('creates cpap log with extended columns', async () => {
			const recordedDate = '2020-09-01';
			const response = await makeRequest('/cpap', {
				method: 'POST',
				body: {
					recorded_date: recordedDate,
					ahi: 1.64,
					ai: 1.42,
					leak: 0.72,
					usage_hours: 9.17,
					ai_count: 13,
					hi_count: 2,
					csa_count: 0,
					snore_count: 1,
					ai_total_duration_sec: 201,
					hi_total_duration_sec: 20,
					pressure_min: 4.0,
					pressure_max: 8.0,
					pressure_mean: 5.31,
					pressure_median: 5.1,
					pressure_p90: 6.7,
					pressure_p95: 7.3,
					br_mean: 16.23,
					br_median: 17.0,
					tv_mean: 464.22,
					tv_median: 400.5,
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);

			const result = await env.health_sync_db.prepare('SELECT * FROM cpap_logs WHERE recorded_date = ?').bind(recordedDate).first();
			expect(result).not.toBeNull();
			expect(result!.ai_count).toBe(13);
			expect(result!.hi_count).toBe(2);
			expect(result!.csa_count).toBe(0);
			expect(result!.snore_count).toBe(1);
			expect(result!.pressure_p95).toBe(7.3);
			expect(result!.br_mean).toBe(16.23);
			expect(result!.tv_mean).toBe(464.22);
		});

		it('preserves existing notes and ai on upsert with COALESCE', async () => {
			const recordedDate = '2020-09-10';

			// Insert initial record with notes and ai
			await makeRequest('/cpap', {
				method: 'POST',
				body: {
					recorded_date: recordedDate,
					ahi: 3.0,
					ai: 2.0,
					notes: 'Mask adjusted',
					usage_hours: 6.5,
				},
				headers: createAuthHeaders(),
			});

			// Upsert without notes and ai (simulating CSV import)
			await makeRequest('/cpap', {
				method: 'POST',
				body: {
					recorded_date: recordedDate,
					ahi: 3.2,
					leak: 1.1,
					usage_hours: 7.0,
					ai_count: 10,
					hi_count: 5,
					pressure_p95: 7.5,
				},
				headers: createAuthHeaders(),
			});

			const result = await env.health_sync_db.prepare('SELECT * FROM cpap_logs WHERE recorded_date = ?').bind(recordedDate).first();
			expect(result).not.toBeNull();
			// notes should be preserved via COALESCE
			expect(result!.notes).toBe('Mask adjusted');
			// ai should be preserved via COALESCE
			expect(result!.ai).toBe(2.0);
			// New columns should be updated
			expect(result!.ai_count).toBe(10);
			expect(result!.pressure_p95).toBe(7.5);
			// ahi and usage_hours should be overwritten
			expect(result!.ahi).toBe(3.2);
			expect(result!.usage_hours).toBe(7.0);
		});
	});

	describe('Error handling', () => {
		it('returns 500 with generic message on DB error (does not leak internals)', async () => {
			// Drop a table to simulate DB error
			await env.health_sync_db.prepare('DROP TABLE IF EXISTS steps').run();

			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					steps: [{ date: '2020-01-01', count: 1000 }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(500);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Database operation failed');
			// Should NOT contain raw SQL error details
			expect(data.error).not.toMatch(/no such table/i);

			// Recreate table for other tests
			await env.health_sync_db
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
			await env.health_sync_db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_date ON steps(date)').run();
		});

		it('returns 500 with generic message on GET /metrics DB error', async () => {
			await env.health_sync_db.prepare('DROP TABLE IF EXISTS body_measurements').run();

			const response = await makeRequest('/metrics?days=7', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(500);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Database operation failed');

			// Recreate table for other tests
			await env.health_sync_db
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
			await env.health_sync_db
				.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_body_measurements_recorded_at ON body_measurements(recorded_at)')
				.run();
		});

		it('rolls back the entire sync atomically when one statement fails', async () => {
			// db.batch wraps all phase-1 statements in an implicit transaction,
			// so a failure on `steps` must also revert the body_measurements row.
			await env.health_sync_db.prepare('DROP TABLE IF EXISTS steps').run();

			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					body_measurements: [{ recorded_at: '2020-09-01T10:00:00Z', weight_kg: 70.0 }],
					steps: [{ date: '2020-09-01', count: 5000 }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(500);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Database operation failed');

			// Body measurement must NOT have been persisted (rolled back).
			const persisted = await env.health_sync_db
				.prepare('SELECT * FROM body_measurements WHERE recorded_at = ?')
				.bind('2020-09-01T10:00:00Z')
				.first();
			expect(persisted).toBeNull();

			// Recreate table for other tests
			await env.health_sync_db
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
			await env.health_sync_db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_date ON steps(date)').run();
		});
	});

	describe('404 handling', () => {
		it('returns 404 for unknown routes', async () => {
			const response = await makeRequest('/unknown');
			expect(response.status).toBe(404);
		});
	});
});
