import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

const API_KEY = 'dev-local-key';

function createAuthHeaders() {
	return {
		'Authorization': `Bearer ${API_KEY}`,
		'Content-Type': 'application/json',
	};
}

async function makeRequest(
	path: string,
	options: {
		method?: string;
		body?: unknown;
		headers?: Record<string, string>;
	} = {}
) {
	const { method = 'GET', body, headers = {} } = options;
	const request = new IncomingRequest(`http://example.com${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env);
	await waitOnExecutionContext(ctx);
	return response;
}

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
			const request = new IncomingRequest('http://example.com/blood-test', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: 'invalid json',
			});
			const ctx = createExecutionContext();
			const response = await worker.fetch(request, env);
			await waitOnExecutionContext(ctx);
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
			const result = await env.health_sync_db
				.prepare('SELECT * FROM blood_tests WHERE test_date = ?')
				.bind(testDate)
				.first();
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
			const result = await env.health_sync_db
				.prepare('SELECT * FROM blood_tests WHERE test_date = ?')
				.bind(testDate)
				.first();
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

			const result = await env.health_sync_db
				.prepare('SELECT * FROM blood_tests WHERE test_date = ?')
				.bind(testDate)
				.first();
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
			expect(data.error).toBe('Invalid days parameter (must be 1-365)');
		});

		it('returns 400 for days > 365', async () => {
			const response = await makeRequest('/blood-test?days=400', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
		});

		it('returns 400 for non-numeric days', async () => {
			const response = await makeRequest('/blood-test?days=abc', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
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

		it('syncs body measurements', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					body_measurements: [
						{ recorded_at: '2020-07-05T10:00:00Z', weight_kg: 70.5, body_fat_percent: 20 },
					],
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

			const result = await env.health_sync_db
				.prepare('SELECT * FROM cpap_logs WHERE recorded_date = ?')
				.bind(recordedDate)
				.first();
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

			const result = await env.health_sync_db
				.prepare('SELECT * FROM cpap_logs WHERE recorded_date = ?')
				.bind(recordedDate)
				.first();
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

	describe('404 handling', () => {
		it('returns 404 for unknown routes', async () => {
			const response = await makeRequest('/unknown');
			expect(response.status).toBe(404);
		});
	});
});
