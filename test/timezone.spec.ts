import { describe, it, expect } from 'vitest';
import { daysAgoDate, todayInAppTZ } from '../src/index';

// Pure-function tests for the JST anchoring helpers. These bypass the Worker
// fetch loop because Cloudflare's vitest pool runs Worker code in an isolate
// where vi.setSystemTime doesn't reach `new Date()` calls inside src/index.ts.
// Hence the helpers accept an optional `now` for injection.

describe('todayInAppTZ', () => {
	it('returns the JST wall-clock date even when UTC has rolled to the next day', () => {
		// JST 2026-04-28 04:00 = UTC 2026-04-27 19:00
		const now = new Date('2026-04-28T04:00:00+09:00');
		expect(todayInAppTZ(now)).toBe('2026-04-28');
	});

	it('returns the JST wall-clock date when UTC is still on the previous day', () => {
		// JST 2026-04-28 08:00 = UTC 2026-04-27 23:00
		const now = new Date('2026-04-28T08:00:00+09:00');
		expect(todayInAppTZ(now)).toBe('2026-04-28');
	});

	it('returns the JST wall-clock date when UTC has already advanced', () => {
		// JST 2026-04-28 18:00 = UTC 2026-04-28 09:00
		const now = new Date('2026-04-28T18:00:00+09:00');
		expect(todayInAppTZ(now)).toBe('2026-04-28');
	});
});

describe('daysAgoDate', () => {
	it('subtracts N days from JST today, regardless of the current UTC date', () => {
		// JST 2026-04-28 04:00 = UTC 2026-04-27 19:00
		const now = new Date('2026-04-28T04:00:00+09:00');
		expect(daysAgoDate(7, now)).toBe('2026-04-21');
		expect(daysAgoDate(0, now)).toBe('2026-04-28');
	});

	it('handles month boundaries correctly', () => {
		const now = new Date('2026-05-03T10:00:00+09:00');
		expect(daysAgoDate(7, now)).toBe('2026-04-26');
	});

	it('handles year boundaries correctly', () => {
		const now = new Date('2026-01-03T10:00:00+09:00');
		expect(daysAgoDate(7, now)).toBe('2025-12-27');
	});

	it('does not drift on JST early morning', () => {
		// Without JST anchoring this used to return the previous UTC day,
		// widening ?days=N windows by a day in the morning.
		const beforeUtcMidnight = new Date('2026-04-28T08:30:00+09:00'); // UTC 2026-04-27 23:30
		const afterUtcMidnight = new Date('2026-04-28T10:00:00+09:00'); // UTC 2026-04-28 01:00
		expect(daysAgoDate(7, beforeUtcMidnight)).toBe('2026-04-21');
		expect(daysAgoDate(7, afterUtcMidnight)).toBe('2026-04-21');
	});
});
