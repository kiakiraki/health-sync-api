import { describe, it, expect } from 'vitest';
import { createAuthHeaders, makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

// Regression tests for request-body validation: malformed payloads must
// come back as 400s with a useful message, never as 500s from D1.
describe('request body validation', () => {
	describe('POST /sync', () => {
		it('returns 400 when body is JSON null', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				rawBody: 'null',
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Request body must be a JSON object');
		});

		it('returns 400 when a section is not an array', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { steps: 'not-an-array' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('steps must be an array');
		});

		it('returns 400 when blood_pressure entry is missing systolic', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { blood_pressure: [{ recorded_at: '2022-01-01T00:00:00Z', diastolic: 80 }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('blood_pressure[0].systolic must be a number');
		});

		it('returns 400 when steps date is malformed', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { steps: [{ date: '2022/01/01', count: 1000 }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('steps[0].date must be YYYY-MM-DD');
		});

		it('returns 400 when a sleep stage entry is malformed', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: {
					sleep_sessions: [
						{
							start_time: '2022-01-01T15:00:00Z',
							end_time: '2022-01-01T23:00:00Z',
							stages: [{ stage: 'deep', start_time: '2022-01-01T15:00:00Z' }],
						},
					],
				},
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('sleep_sessions[0].stages[0].end_time must be a non-empty string');
		});

		it('returns 400 when heart_rate is not an array', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { heart_rate: 'not-an-array' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('heart_rate must be an array');
		});

		it('returns 400 when heart_rate entry is missing bpm', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { heart_rate: [{ recorded_at: '2022-01-01T00:00:00Z' }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('heart_rate[0].bpm must be a number');
		});

		it('returns 400 when resting_heart_rate date is malformed', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { resting_heart_rate: [{ date: '2022/01/01', bpm: 55 }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('resting_heart_rate[0].date must be YYYY-MM-DD');
		});

		it('returns 400 when spo2 percentage is not a number', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { spo2: [{ recorded_at: '2022-01-01T00:00:00Z', percentage: '98' }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('spo2[0].percentage must be a number');
		});

		it('returns 400 when daily_activity date is malformed', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { daily_activity: [{ date: '2022.01.01' }] },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('daily_activity[0].date must be YYYY-MM-DD');
		});

		it('still accepts a valid payload', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: {
					body_measurements: [{ recorded_at: '2022-01-02T00:00:00Z', weight_kg: 70 }],
					steps: [{ date: '2022-01-02', count: 8000 }],
				},
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
		});
	});

	describe('POST /cpap', () => {
		it('returns 400 when body is JSON null', async () => {
			const response = await makeRequest('/cpap', {
				method: 'POST',
				headers: createAuthHeaders(),
				rawBody: 'null',
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Request body must be a JSON object');
		});

		it('returns 400 for malformed recorded_date', async () => {
			const response = await makeRequest('/cpap', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { recorded_date: '20220101' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid recorded_date format (must be YYYY-MM-DD)');
		});

		it('returns 400 for a non-numeric metric field', async () => {
			const response = await makeRequest('/cpap', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { recorded_date: '2022-01-01', ahi: 'high' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('ahi must be a number');
		});
	});

	describe('POST /blood-test', () => {
		it('returns 400 for malformed test_date', async () => {
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { test_date: '2022.01.01' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid test_date format (must be YYYY-MM-DD)');
		});

		it('returns 400 for a non-numeric metric field', async () => {
			const response = await makeRequest('/blood-test', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { test_date: '2022-01-01', glucose: '95' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('glucose must be a number');
		});
	});

	describe('POST /meals', () => {
		it('returns 400 when body is JSON null', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				headers: createAuthHeaders(),
				rawBody: 'null',
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Request body must be a JSON object');
		});

		it('returns 400 for a non-numeric nutrition field', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				headers: createAuthHeaders(),
				body: { date: '2022-01-01', meal_type: 'lunch', description: 'soba', calories_kcal: 'lots' },
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('calories_kcal must be a number');
		});
	});

	describe('authentication', () => {
		it('rejects a wrong key of the same length as the real one', async () => {
			const response = await makeRequest('/metrics', {
				headers: { Authorization: 'Bearer dev-local-kez' },
			});
			expect(response.status).toBe(401);
		});
	});
});
