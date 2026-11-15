import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

// Guards migration 0009: the redundant non-unique indexes are gone, and the
// date-range reads they used to serve still hit the remaining unique index.
describe('schema indexes', () => {
	it('has no index duplicating a unique index', async () => {
		const { results } = await env.health_sync_db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all<{ name: string }>();
		const names = results.map((r) => r.name);
		for (const dropped of [
			'idx_body_recorded',
			'idx_bp_recorded',
			'idx_sleep_start',
			'idx_cpap_date',
			'idx_blood_tests_date',
			'idx_meals_date',
		]) {
			expect(names).not.toContain(dropped);
		}
	});

	it.each([
		['body_measurements', 'recorded_at'],
		['blood_pressure', 'recorded_at'],
		['sleep_sessions', 'start_time'],
		['cpap_logs', 'recorded_date'],
		['blood_tests', 'test_date'],
		['meals', 'date'],
	])('date-range read on %s.%s still uses an index', async (table, column) => {
		const { results } = await env.health_sync_db
			.prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${column} >= ? ORDER BY ${column}`)
			.bind('2026-01-01')
			.all<{ detail: string }>();
		const plan = results.map((r) => r.detail).join(' | ');
		expect(plan).toMatch(/USING INDEX/);
		expect(plan).not.toMatch(/USE TEMP B-TREE/);
	});
});
