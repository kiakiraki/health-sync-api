# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

health-sync-api is a Cloudflare Workers API for syncing and storing health metrics data. It uses D1 (Cloudflare's SQLite database) for persistence.

## Development Commands

```bash
# Start development server
npm run dev

# Run tests (uses @cloudflare/vitest-pool-workers)
npm run test

# Run a single test file
npx vitest test/index.spec.ts

# Run tests in watch mode
npx vitest --watch

# Deploy to Cloudflare
npm run deploy

# Generate TypeScript types from wrangler config
npm run cf-typegen
```

## Database Migrations

D1 migrations are in `migrations/`. Initial schema is in `schema.sql`.

```bash
# Create a new migration
npx wrangler d1 migrations create health-sync-db <migration-name>

# Apply migrations (local)
npx wrangler d1 migrations apply health-sync-db --local

# Apply migrations (remote)
npx wrangler d1 migrations apply health-sync-db --remote
```

## Architecture

### API Endpoints

All endpoints except `/health` require Bearer token authentication via `API_KEY` secret.

- `GET /health` - Health check (no auth)
- `POST /sync` - Batch insert health metrics (body_measurements, blood_pressure, sleep_sessions, steps)
- `POST /cpap` - Upsert CPAP log entry (uses ON CONFLICT for recorded_date)
- `GET /metrics?days=N` - Query all health data for the last N days (1-365)

### Data Models

Five tables store health data:
- `body_measurements` - Weight and body fat percentage
- `blood_pressure` - Systolic, diastolic, and pulse
- `sleep_sessions` - Sleep start/end times and duration
- `steps` - Daily step counts
- `cpap_logs` - CPAP therapy data (AHI, AI, leak, usage hours)

### Environment Bindings

Defined in `wrangler.jsonc`:
- `health_sync_db` - D1 database binding
- `API_KEY` - Secret for authentication (set via `wrangler secret put API_KEY`)

### Testing

Uses `@cloudflare/vitest-pool-workers` which runs tests in a simulated Workers environment. Test files are in `test/` directory with a separate tsconfig that extends the main one.
