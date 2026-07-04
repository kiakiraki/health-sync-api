import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createAuthHeaders, makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

// D1 allows at most 100 bound parameters per query. Before the IN-list was
// chunked, GET /metrics failed with a 500 as soon as the date window held
// more than 100 sleep sessions. 130 sessions cross the limit boundary.
describe('GET /metrics with more than 100 sleep sessions', () => {
	it('joins stages across the D1 bound-parameter limit', async () => {
		const db = env.health_sync_db;
		const sessionCount = 130;

		const sessionStmt = db.prepare('INSERT INTO sleep_sessions (start_time, end_time, duration_hours) VALUES (?, ?, ?)');
		const sessionInserts = [];
		for (let i = 0; i < sessionCount; i++) {
			const day = new Date(Date.UTC(2021, 0, 1 + i)).toISOString().split('T')[0];
			sessionInserts.push(sessionStmt.bind(`${day}T15:00:00Z`, `${day}T23:00:00Z`, 8));
		}
		await db.batch(sessionInserts);

		const sessions = await db
			.prepare(`SELECT id, start_time FROM sleep_sessions WHERE start_time >= '2021-01-01' AND start_time < '2021-06-01'`)
			.all<{ id: number; start_time: string }>();
		expect(sessions.results.length).toBe(sessionCount);

		const stageStmt = db.prepare('INSERT INTO sleep_stages (sleep_session_id, stage, start_time, end_time) VALUES (?, ?, ?, ?)');
		await db.batch(sessions.results.map((s) => stageStmt.bind(s.id, 'deep', s.start_time, s.start_time)));

		const response = await makeRequest('/metrics?from=2021-01-01&to=2021-05-31', {
			headers: createAuthHeaders(),
		});
		expect(response.status).toBe(200);

		const data = await response.json<AnyJson>();
		expect(data.sleep_sessions.length).toBe(sessionCount);
		for (const session of data.sleep_sessions) {
			expect(session.stages.length).toBe(1);
			expect(session.stages[0].stage).toBe('deep');
		}
	});
});
