import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default tseslint.config(
	{
		ignores: ['node_modules/**', '.wrangler/**', 'dist/**', 'coverage/**', 'scripts/output/**', 'worker-configuration.d.ts'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
		},
		rules: {
			'@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
		},
	},
	prettier,
);
