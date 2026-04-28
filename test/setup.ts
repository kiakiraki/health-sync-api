import { env } from 'cloudflare:test';
import schema from '../schema.sql?raw';
import migration0001 from '../migrations/0001_add_cpap_logs.sql?raw';
import migration0002 from '../migrations/0002_add_unique_constraints.sql?raw';
import migration0003 from '../migrations/0003_add_blood_tests.sql?raw';
import migration0004 from '../migrations/0004_expand_cpap_logs.sql?raw';
import migration0005 from '../migrations/0005_add_meals.sql?raw';
import migration0006 from '../migrations/0006_add_sleep_stages.sql?raw';

// Replays schema.sql + migrations/*.sql against the test DB so that the
// test schema mirrors what `wrangler d1 migrations apply` would produce.
// Previously these tables were re-declared by hand inside this file, which
// silently drifted whenever a new migration was added.
const migrations = [schema, migration0001, migration0002, migration0003, migration0004, migration0005, migration0006];

const setupDatabase = async () => {
	const db = env.health_sync_db;
	for (const sql of migrations) {
		await db.exec(stripCommentsAndCollapse(sql));
	}
};

// D1's exec() requires every statement on its own line and rejects
// comments / blank lines, so flatten each statement to a single line and
// drop `--` comments and empties before handing it over.
function stripCommentsAndCollapse(sql: string): string {
	const stmts: string[] = [];
	let buf = '';
	for (const rawLine of sql.split('\n')) {
		const line = rawLine.replace(/--.*$/, '').trim();
		if (line === '') continue;
		buf += (buf ? ' ' : '') + line;
		if (line.endsWith(';')) {
			stmts.push(buf);
			buf = '';
		}
	}
	if (buf.trim() !== '') stmts.push(buf.trim());
	return stmts.join('\n');
}

await setupDatabase();
