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

# Lint / format / typecheck
npm run lint           # ESLint v10 (flat config: eslint.config.mjs)
npm run lint:fix       # auto-fix where possible
npm run format         # Prettier --write
npm run format:check   # Prettier --check (used in CI)
npm run typecheck      # tsc --noEmit -p test/tsconfig.json
```

Lint stack: ESLint v10 + `typescript-eslint` (recommended ruleset) with `eslint-config-prettier` to disable stylistic rules. Prettier config is in `.prettierrc` (tabs, single quotes, semi, `printWidth: 140`); ignores in `.prettierignore`. CI runs `format:check`, `lint`, `typecheck`, and tests on every PR.

## Database Migrations

D1 migrations live in `migrations/` (numbered `0001_…` onwards). `schema.sql` is the _initial_ schema reference but is **not** the source of truth for production — applied migrations are.

```bash
# Create a new migration
npx wrangler d1 migrations create health-sync-db <migration-name>

# Apply migrations (local miniflare)
npx wrangler d1 migrations apply health-sync-db --local

# Apply migrations (remote)
npx wrangler d1 migrations apply health-sync-db --remote
```

**Tests replay `schema.sql` + `migrations/*.sql`.** `test/setup.ts` imports each SQL file via Vite `?raw` and runs them through `db.exec()` in order. The `?raw` ambient module is declared in `test/env.d.ts`. When you add a new migration, also add a matching `import` line in `test/setup.ts` so it gets replayed; otherwise tests will fail with "no such column / table". (D1's `exec()` requires statement-per-line with no comments, so the helper in `test/setup.ts` strips `--` comments and collapses each statement to a single line before handing it over.)

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

**The server is anchored to `Asia/Tokyo` (`APP_TZ` in `src/index.ts`).** All `?days=N` / `?from` / `?to` parameters and `date`-typed columns are interpreted as JST wall-clock days. The Android client (`../health-sync-app`) records `steps.date` via `LocalDate.ofInstant(_, ZoneId.systemDefault())`, so JST anchoring on the server keeps writer and reader in sync without per-request TZ negotiation. There is no DST in `Asia/Tokyo`, so a literal `+09:00` offset is used in the conversion helpers.

All list endpoints accept the same query-param shape, parsed by `parseDateRangeParams(url, defaultDays?)`:

- `?days=N` — last N days, ending at _JST_ today (positive integer).
- `?from=YYYY-MM-DD` and/or `?to=YYYY-MM-DD` — JST wall-clock days. `from`/`to` win over `days` when both are supplied.
- No params → fall back to `defaultDays` (7 for `/metrics` and `/meals`; none for `/blood-test`).

`daysAgoDate(days, now?)` and `todayInAppTZ(now?)` are exported with an optional `now` argument so they can be unit-tested without `vi.setSystemTime` — Cloudflare's vitest pool runs Worker code in an isolate where the timer mock doesn't reach `new Date()` inside the handler. `test/timezone.spec.ts` covers the JST anchoring; the rest of the assertions still go through the fetch handler.

`buildDateFilter(column, type, range)` constructs the `WHERE` fragment. For `'datetime'` columns the bounds are converted from JST wall-clock days to UTC ISO strings (`YYYY-MM-DDT...+09:00 → ...Z`), and the upper bound is **half-open** (`< start of (to+1) JST day in UTC`) — an inclusive `<= '...23:59:59.999Z'` would silently drop stored `'...59Z'` values because `Z` > `.` in ASCII order. `'date'` columns are compared as JST-day strings directly. Columns and their types:

- `recorded_at` (body_measurements, blood_pressure) → datetime (UTC `Z` stored, JST window applied)
- `start_time` (sleep_sessions) → datetime
- `date` (steps, meals) → date (JST day string)
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
