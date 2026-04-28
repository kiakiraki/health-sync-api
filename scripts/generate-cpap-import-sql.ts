import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const ROWS_PER_FILE = 100;

const csvPath = process.argv[2];
if (!csvPath) {
	console.error('Usage: npx tsx scripts/generate-cpap-import-sql.ts <path-to-csv>');
	process.exit(1);
}

const raw = readFileSync(resolve(csvPath), 'utf-8');
const lines = raw.replace(/\r\n/g, '\n').trim().split('\n');
const header = lines[0].split(',');
const rows = lines.slice(1);

console.log(`Read ${rows.length} data rows from CSV`);

function escapeSQL(value: string): string {
	return value.replace(/'/g, "''");
}

function buildInsert(row: string[]): string {
	const record: Record<string, string> = {};
	for (let i = 0; i < header.length; i++) {
		record[header[i]] = row[i];
	}

	const recordedDate = record['date'];
	const usageHours = parseFloat(record['usage_hours']);
	const aiCount = parseInt(record['ai_count'], 10);

	// Calculate AI index: ai_count / usage_hours
	const ai = usageHours > 0 ? aiCount / usageHours : null;

	const dbColumns = [
		'recorded_date',
		'ahi',
		'ai',
		'leak',
		'usage_hours',
		'ai_count',
		'hi_count',
		'csa_count',
		'snore_count',
		'ai_total_duration_sec',
		'hi_total_duration_sec',
		'pressure_min',
		'pressure_max',
		'pressure_mean',
		'pressure_median',
		'pressure_p90',
		'pressure_p95',
		'br_mean',
		'br_median',
		'tv_mean',
		'tv_median',
	];

	const values: string[] = [
		`'${escapeSQL(recordedDate)}'`, // recorded_date
		formatNum(record['ahi']), // ahi
		ai !== null ? ai.toFixed(4) : 'NULL', // ai (calculated)
		formatNum(record['leak_avg_lpm']), // leak
		formatNum(record['usage_hours']), // usage_hours
		formatInt(record['ai_count']), // ai_count
		formatInt(record['hi_count']), // hi_count
		formatInt(record['csa_count']), // csa_count
		formatInt(record['snore_count']), // snore_count
		formatNum(record['ai_total_duration_sec']), // ai_total_duration_sec
		formatNum(record['hi_total_duration_sec']), // hi_total_duration_sec
		formatNum(record['pressure_min']), // pressure_min
		formatNum(record['pressure_max']), // pressure_max
		formatNum(record['pressure_mean']), // pressure_mean
		formatNum(record['pressure_median']), // pressure_median
		formatNum(record['pressure_p90']), // pressure_p90
		formatNum(record['pressure_p95']), // pressure_p95
		formatNum(record['br_mean']), // br_mean
		formatNum(record['br_median']), // br_median
		formatNum(record['tv_mean']), // tv_mean
		formatNum(record['tv_median']), // tv_median
	];

	return `INSERT INTO cpap_logs (${dbColumns.join(', ')})
VALUES (${values.join(', ')})
ON CONFLICT(recorded_date) DO UPDATE SET
  ahi = COALESCE(cpap_logs.ahi, excluded.ahi),
  ai = COALESCE(cpap_logs.ai, excluded.ai),
  leak = COALESCE(cpap_logs.leak, excluded.leak),
  usage_hours = COALESCE(cpap_logs.usage_hours, excluded.usage_hours),
  notes = COALESCE(cpap_logs.notes, excluded.notes),
  ai_count = COALESCE(cpap_logs.ai_count, excluded.ai_count),
  hi_count = COALESCE(cpap_logs.hi_count, excluded.hi_count),
  csa_count = COALESCE(cpap_logs.csa_count, excluded.csa_count),
  snore_count = COALESCE(cpap_logs.snore_count, excluded.snore_count),
  ai_total_duration_sec = COALESCE(cpap_logs.ai_total_duration_sec, excluded.ai_total_duration_sec),
  hi_total_duration_sec = COALESCE(cpap_logs.hi_total_duration_sec, excluded.hi_total_duration_sec),
  pressure_min = COALESCE(cpap_logs.pressure_min, excluded.pressure_min),
  pressure_max = COALESCE(cpap_logs.pressure_max, excluded.pressure_max),
  pressure_mean = COALESCE(cpap_logs.pressure_mean, excluded.pressure_mean),
  pressure_median = COALESCE(cpap_logs.pressure_median, excluded.pressure_median),
  pressure_p90 = COALESCE(cpap_logs.pressure_p90, excluded.pressure_p90),
  pressure_p95 = COALESCE(cpap_logs.pressure_p95, excluded.pressure_p95),
  br_mean = COALESCE(cpap_logs.br_mean, excluded.br_mean),
  br_median = COALESCE(cpap_logs.br_median, excluded.br_median),
  tv_mean = COALESCE(cpap_logs.tv_mean, excluded.tv_mean),
  tv_median = COALESCE(cpap_logs.tv_median, excluded.tv_median);`;
}

function formatNum(val: string | undefined): string {
	if (!val || val.trim() === '') return 'NULL';
	const n = parseFloat(val);
	return isNaN(n) ? 'NULL' : String(n);
}

function formatInt(val: string | undefined): string {
	if (!val || val.trim() === '') return 'NULL';
	const n = parseInt(val, 10);
	return isNaN(n) ? 'NULL' : String(n);
}

// Generate SQL files split by ROWS_PER_FILE
const outputDir = resolve(dirname(new URL(import.meta.url).pathname), 'output');
mkdirSync(outputDir, { recursive: true });

const totalFiles = Math.ceil(rows.length / ROWS_PER_FILE);
for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
	const start = fileIdx * ROWS_PER_FILE;
	const end = Math.min(start + ROWS_PER_FILE, rows.length);
	const chunk = rows.slice(start, end);

	const statements = chunk.map((line) => {
		const cols = line.split(',');
		return buildInsert(cols);
	});

	const fileNum = String(fileIdx + 1).padStart(3, '0');
	const filePath = resolve(outputDir, `cpap_import_${fileNum}.sql`);
	writeFileSync(filePath, statements.join('\n\n') + '\n');
	console.log(`Written ${filePath} (${chunk.length} rows)`);
}

console.log(`\nDone! Generated ${totalFiles} SQL file(s) in ${outputDir}`);
