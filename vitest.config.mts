import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: {
					API_KEY: 'dev-local-key',
				},
			},
		}),
	],
	test: {
		setupFiles: ['./test/setup.ts'],
	},
});
