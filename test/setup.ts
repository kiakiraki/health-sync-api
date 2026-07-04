import { env } from 'cloudflare:test';
import schema from '../schema.sql?raw';

// Replays schema.sql + migrations/*.sql against the test DB so that the
// test schema mirrors what `wrangler d1 migrations apply` would produce.
// Migrations are auto-discovered via import.meta.glob and sorted by their
// numeric filename prefix, so adding a migration file is enough — no manual
// import line to forget here.
const migrationModules = import.meta.glob('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
	string,
	string
>;
const migrations = [
	schema,
	...Object.keys(migrationModules)
		.sort()
		.map((path) => migrationModules[path]),
];

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
