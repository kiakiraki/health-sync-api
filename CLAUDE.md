# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

health-sync-api is a Cloudflare Workers API for syncing and storing personal health metrics. Persistence is Cloudflare D1 (SQLite). The whole worker is a single `src/index.ts` file with hand-rolled routing in the default `fetch` handler.

## Development Commands

```bash
# Start local dev server (wrangler dev / miniflare)
npm run dev

# Run all tests (vitest under @cloudflare/vitest-pool-workers)
npm run test

# Run a single test file
npx vitest test/index.spec.ts

# Watch mode
npx vitest --watch

# Deploy to Cloudflare
npm run deploy

# Regenerate worker-configuration.d.ts from wrangler.jsonc
npm run cf-typegen
```

There is no dedicated `lint` or `typecheck` script. TypeScript is checked implicitly via vitest/wrangler; formatting is Prettier (`.prettierrc`: tabs, single quotes, semi, `printWidth: 140`).

## Database Migrations

D1 migrations live in `migrations/` (numbered `0001_…` onwards). `schema.sql` is the *initial* schema reference but is **not** the source of truth for production — applied migrations are.

```bash
# Create a new migration
npx wrangler d1 migrations create health-sync-db <migration-name>

# Apply migrations (local miniflare)
npx wrangler d1 migrations apply health-sync-db --local

# Apply migrations (remote)
npx wrangler d1 migrations apply health-sync-db --remote
```

**Important — tests do NOT run migrations.** `test/setup.ts` re-creates the schema by hand using inline `CREATE TABLE` / `CREATE INDEX` statements. Whenever you add a migration that changes the schema (new table, new column, new unique index), you must mirror the change in `test/setup.ts` or tests will fail with "no such column / table".

## Architecture

### Routing

`src/index.ts` exports a single `fetch` handler that pattern-matches on `path` + `method`. There is no router framework. All endpoints except `GET /health` go through `authenticate(request, env)` which compares a `Bearer <token>` header against the `API_KEY` secret. In tests `API_KEY` is bound to `dev-local-key` via `vitest.config.mts`.

A top-level `try/catch` in `fetch` distinguishes D1/SQLITE-flavored errors from generic ones for the 500 response message.

### API Endpoints

- `GET /health` — health check, no auth.
- `POST /sync` — **upsert** batch of `body_measurements`, `blood_pressure`, `sleep_sessions`, `steps` (each via `ON CONFLICT … DO UPDATE`, keyed on `recorded_at` / `start_time` / `date`). If a `sleep_sessions` entry includes a `stages[]` array, the matching `sleep_stages` rows are replaced (DELETE + INSERT in a single `db.batch`) and consecutive same-stage rows are merged via `mergeConsecutiveStages`.
- `POST /cpap` — upsert one CPAP log row keyed on `recorded_date`. `ai` and `notes` use `COALESCE` so existing values are preserved when the incoming payload omits them; the rest overwrite.
- `POST /blood-test` — upsert one blood test row keyed on `test_date`.
- `GET /blood-test` — list blood tests, no default date window (returns all rows when no params).
- `POST /meals` — upsert one meal entry keyed on `(date, meal_type)`. `meal_type` must be one of `breakfast | lunch | dinner | snack`.
- `GET /meals` — list meals, default window 7 days, ordered by `date ASC` then meal-type order.
- `GET /metrics` — fan-out `Promise.all` over body, BP, sleep sessions, steps, CPAP, blood tests; default window 7 days. Sleep sessions are joined with their `sleep_stages` via a single `WHERE sleep_session_id IN (…)` query (this avoided an N+1 — see commit `80647f7`; do not regress this).

### Date filter helpers

All list endpoints accept the same query-param shape, parsed by `parseDateRangeParams(url, defaultDays?)`:

- `?days=N` — last N days (positive integer).
- `?from=YYYY-MM-DD` and/or `?to=YYYY-MM-DD` — inclusive range. `from`/`to` win over `days` when both are supplied.
- No params → fall back to `defaultDays` (7 for `/metrics` and `/meals`; none for `/blood-test`).

`buildDateFilter(column, type, range)` then constructs the `WHERE` fragment. The `type` arg matters: `'datetime'` columns get padded to `… 00:00:00` / `… 23:59:59`, `'date'` columns are compared as-is. Columns and their types:
- `recorded_at` (body_measurements, blood_pressure) → datetime
- `start_time` (sleep_sessions) → datetime
- `date` (steps, meals) → date
- `recorded_date` (cpap_logs) → date
- `test_date` (blood_tests) → date

### Data Model

D1 tables (see `schema.sql` + `migrations/`):
- `body_measurements`, `blood_pressure`, `sleep_sessions`, `steps` — the four "sync" tables, each with a unique index on its time column to enable upserts (added in `0002`).
- `sleep_stages` — Health Connect-style stage segments, FK to `sleep_sessions(id)` with `ON DELETE CASCADE` (`0006`).
- `cpap_logs` — CPAP therapy data; original columns in `0001`, expanded in `0004` with pressure / breathing rate / tidal volume statistics and event counts.
- `blood_tests` — clinical lab values keyed on `test_date` (`0003`).
- `meals` — meal logging keyed on `(date, meal_type)` (`0005`).

### Environment Bindings

Defined in `wrangler.jsonc`:
- `health_sync_db` — D1 binding (database name `health-sync-db`).
- `API_KEY` — secret, set via `wrangler secret put API_KEY` (locally injected by `vitest.config.mts`).

### One-off scripts

- `scripts/generate-cpap-import-sql.ts` — converts a CPAP CSV export into chunked `INSERT … ON CONFLICT DO UPDATE` SQL files (100 rows each) under `scripts/output/`. Run with `npx tsx scripts/generate-cpap-import-sql.ts <csv>`. Used for backfilling historical CPAP data; not part of the request path.
