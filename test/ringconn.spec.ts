import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createAuthHeaders, makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

// RingConn Gen 2 metrics synced via Health Connect: heart_rate, resting_heart_rate,
// spo2, daily_activity.
describe('RingConn Gen 2 metrics', () => {
	describe('POST /sync', () => {
		it('syncs heart_rate, resting_heart_rate, spo2 and daily_activity', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					heart_rate: [{ recorded_at: '2021-01-05T10:00:00Z', bpm: 72 }],
					resting_heart_rate: [{ date: '2021-01-05', bpm: 58 }],
					spo2: [{ recorded_at: '2021-01-05T10:00:00Z', percentage: 97.5 }],
					daily_activity: [{ date: '2021-01-05', active_calories_kcal: 320.5, total_calories_kcal: 2100 }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.inserted.heart_rate).toBe(1);
			expect(data.inserted.resting_heart_rate).toBe(1);
			expect(data.inserted.spo2).toBe(1);
			expect(data.inserted.daily_activity).toBe(1);

			const hr = await env.health_sync_db.prepare('SELECT * FROM heart_rate WHERE recorded_at = ?').bind('2021-01-05T10:00:00Z').first();
			expect(hr).not.toBeNull();
			expect(hr!.bpm).toBe(72);

			const rhr = await env.health_sync_db.prepare('SELECT * FROM resting_heart_rate WHERE date = ?').bind('2021-01-05').first();
			expect(rhr).not.toBeNull();
			expect(rhr!.bpm).toBe(58);

			const sp = await env.health_sync_db.prepare('SELECT * FROM spo2 WHERE recorded_at = ?').bind('2021-01-05T10:00:00Z').first();
			expect(sp).not.toBeNull();
			expect(sp!.percentage).toBe(97.5);

			const da = await env.health_sync_db.prepare('SELECT * FROM daily_activity WHERE date = ?').bind('2021-01-05').first();
			expect(da).not.toBeNull();
			expect(da!.active_calories_kcal).toBe(320.5);
			expect(da!.total_calories_kcal).toBe(2100);
		});

		it('creates daily_activity row with only required field', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					daily_activity: [{ date: '2021-01-06' }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);

			const da = await env.health_sync_db.prepare('SELECT * FROM daily_activity WHERE date = ?').bind('2021-01-06').first();
			expect(da).not.toBeNull();
			expect(da!.active_calories_kcal).toBeNull();
			expect(da!.total_calories_kcal).toBeNull();
		});

		it('updates heart_rate on conflict (upsert) instead of duplicating', async () => {
			const recordedAt = '2021-01-07T08:00:00Z';

			await makeRequest('/sync', {
				method: 'POST',
				body: { heart_rate: [{ recorded_at: recordedAt, bpm: 65 }] },
				headers: createAuthHeaders(),
			});
			await makeRequest('/sync', {
				method: 'POST',
				body: { heart_rate: [{ recorded_at: recordedAt, bpm: 80 }] },
				headers: createAuthHeaders(),
			});

			const rows = await env.health_sync_db.prepare('SELECT * FROM heart_rate WHERE recorded_at = ?').bind(recordedAt).all();
			expect(rows.results.length).toBe(1);
			expect(rows.results[0].bpm).toBe(80);
		});

		it('updates daily_activity on conflict (upsert) instead of duplicating', async () => {
			const date = '2021-01-08';

			await makeRequest('/sync', {
				method: 'POST',
				body: { daily_activity: [{ date, active_calories_kcal: 200, total_calories_kcal: 1800 }] },
				headers: createAuthHeaders(),
			});
			await makeRequest('/sync', {
				method: 'POST',
				body: { daily_activity: [{ date, active_calories_kcal: 250, total_calories_kcal: 1900 }] },
				headers: createAuthHeaders(),
			});

			const rows = await env.health_sync_db.prepare('SELECT * FROM daily_activity WHERE date = ?').bind(date).all();
			expect(rows.results.length).toBe(1);
			expect(rows.results[0].active_calories_kcal).toBe(250);
			expect(rows.results[0].total_calories_kcal).toBe(1900);
		});

		it('still accepts a payload without the new keys (backward compatibility)', async () => {
			const response = await makeRequest('/sync', {
				method: 'POST',
				body: {
					body_measurements: [{ recorded_at: '2021-01-09T10:00:00Z', weight_kg: 68 }],
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.inserted.heart_rate).toBe(0);
			expect(data.inserted.resting_heart_rate).toBe(0);
			expect(data.inserted.spo2).toBe(0);
			expect(data.inserted.daily_activity).toBe(0);
		});
	});

	describe('GET /metrics', () => {
		it('includes the new keys in the response', async () => {
			const response = await makeRequest('/metrics?days=7', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			expect(data).toHaveProperty('heart_rate');
			expect(data).toHaveProperty('resting_heart_rate');
			expect(data).toHaveProperty('spo2');
			expect(data).toHaveProperty('daily_activity');
			expect(Array.isArray(data.heart_rate)).toBe(true);
			expect(Array.isArray(data.daily_activity)).toBe(true);
		});

		it('filters heart_rate (datetime column) by from/to in JST', async () => {
			await makeRequest('/sync', {
				method: 'POST',
				body: {
					heart_rate: [
						{ recorded_at: '2021-02-14T15:00:00Z', bpm: 60 }, // JST 2/15 00:00 — in
						{ recorded_at: '2021-02-15T14:59:59Z', bpm: 61 }, // JST 2/15 23:59:59 — in
						{ recorded_at: '2021-02-15T15:00:00Z', bpm: 62 }, // JST 2/16 00:00 — out
						{ recorded_at: '2021-02-14T14:59:59Z', bpm: 59 }, // JST 2/14 23:59:59 — out
					],
				},
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?from=2021-02-15&to=2021-02-15', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			const kept = data.heart_rate.map((r: AnyJson) => r.recorded_at).sort();
			expect(kept).toEqual(['2021-02-14T15:00:00Z', '2021-02-15T14:59:59Z']);
		});

		it('filters daily_activity (date column) by from/to', async () => {
			await makeRequest('/sync', {
				method: 'POST',
				body: {
					daily_activity: [
						{ date: '2021-03-01', total_calories_kcal: 2000 },
						{ date: '2021-03-15', total_calories_kcal: 2100 },
						{ date: '2021-04-01', total_calories_kcal: 2200 },
					],
				},
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/metrics?from=2021-03-01&to=2021-03-31', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			expect(data.daily_activity.every((d: AnyJson) => d.date >= '2021-03-01' && d.date <= '2021-03-31')).toBe(true);
			expect(data.daily_activity.some((d: AnyJson) => d.date === '2021-03-01')).toBe(true);
			expect(data.daily_activity.some((d: AnyJson) => d.date === '2021-03-15')).toBe(true);
			expect(data.daily_activity.some((d: AnyJson) => d.date === '2021-04-01')).toBe(false);
		});
	});
});
