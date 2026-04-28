import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createAuthHeaders, makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

describe('Meals API', () => {
	describe('POST /meals', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-01-01', meal_type: 'breakfast', description: 'Toast' },
				headers: { 'Content-Type': 'application/json' },
			});
			expect(response.status).toBe(401);
		});

		it('creates meal record with all fields', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: {
					date: '2020-01-10',
					meal_type: 'lunch',
					description: 'Grilled chicken salad',
					calories_kcal: 450,
					protein_g: 35,
					fat_g: 15,
					carbs_g: 30,
					fiber_g: 5,
					salt_g: 1.2,
					note: 'Healthy lunch',
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);
			const data = await response.json<AnyJson>();
			expect(data.success).toBe(true);
			expect(data.date).toBe('2020-01-10');
			expect(data.meal_type).toBe('lunch');

			// Verify data was stored
			const result = await env.health_sync_db
				.prepare('SELECT * FROM meals WHERE date = ? AND meal_type = ?')
				.bind('2020-01-10', 'lunch')
				.first();
			expect(result).not.toBeNull();
			expect(result!.description).toBe('Grilled chicken salad');
			expect(result!.calories_kcal).toBe(450);
			expect(result!.protein_g).toBe(35);
			expect(result!.fat_g).toBe(15);
			expect(result!.carbs_g).toBe(30);
			expect(result!.fiber_g).toBe(5);
			expect(result!.salt_g).toBe(1.2);
			expect(result!.note).toBe('Healthy lunch');
		});

		it('creates meal record with required fields only', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: {
					date: '2020-01-11',
					meal_type: 'dinner',
					description: 'Pasta',
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);

			const result = await env.health_sync_db
				.prepare('SELECT * FROM meals WHERE date = ? AND meal_type = ?')
				.bind('2020-01-11', 'dinner')
				.first();
			expect(result).not.toBeNull();
			expect(result!.description).toBe('Pasta');
			expect(result!.calories_kcal).toBeNull();
			expect(result!.protein_g).toBeNull();
		});

		it('returns 400 when date is missing', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { meal_type: 'breakfast', description: 'Toast' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('date is required');
		});

		it('returns 400 for invalid date format', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020/01/01', meal_type: 'breakfast', description: 'Toast' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid date format (must be YYYY-MM-DD)');
		});

		it('returns 400 for invalid meal_type', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-01-01', meal_type: 'brunch', description: 'Eggs' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('meal_type must be one of: breakfast, lunch, dinner, snack');
		});

		it('returns 400 for missing meal_type', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-01-01', description: 'Eggs' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('meal_type must be one of: breakfast, lunch, dinner, snack');
		});

		it('returns 400 when description is empty', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-01-01', meal_type: 'breakfast', description: '' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('description is required');
		});

		it('returns 400 when description is whitespace only', async () => {
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-01-01', meal_type: 'breakfast', description: '   ' },
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('description is required');
		});

		it('updates existing record on conflict (upsert)', async () => {
			const date = '2020-02-01';
			const mealType = 'breakfast';

			// Insert initial record
			await makeRequest('/meals', {
				method: 'POST',
				body: {
					date,
					meal_type: mealType,
					description: 'Toast and eggs',
					calories_kcal: 300,
				},
				headers: createAuthHeaders(),
			});

			// Update with same date + meal_type
			const response = await makeRequest('/meals', {
				method: 'POST',
				body: {
					date,
					meal_type: mealType,
					description: 'Pancakes',
					calories_kcal: 500,
					protein_g: 10,
				},
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(201);

			// Verify record was updated
			const result = await env.health_sync_db.prepare('SELECT * FROM meals WHERE date = ? AND meal_type = ?').bind(date, mealType).first();
			expect(result!.description).toBe('Pancakes');
			expect(result!.calories_kcal).toBe(500);
			expect(result!.protein_g).toBe(10);
		});
	});

	describe('GET /meals', () => {
		it('returns 401 without authentication', async () => {
			const response = await makeRequest('/meals');
			expect(response.status).toBe(401);
		});

		it('returns meals with default 7-day range', async () => {
			// Insert a meal for today
			const today = new Date().toISOString().split('T')[0];
			await makeRequest('/meals', {
				method: 'POST',
				body: { date: today, meal_type: 'breakfast', description: 'Oatmeal' },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/meals', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.meals).toBeDefined();
			expect(Array.isArray(data.meals)).toBe(true);
			expect(data.meals.length).toBeGreaterThanOrEqual(1);
		});

		it('filters by days parameter', async () => {
			const response = await makeRequest('/meals?days=30', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.meals).toBeDefined();
		});

		it('filters by from/to parameters', async () => {
			// Insert meals at known dates
			await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-03-01', meal_type: 'breakfast', description: 'Cereal' },
				headers: createAuthHeaders(),
			});
			await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-06-01', meal_type: 'breakfast', description: 'Smoothie' },
				headers: createAuthHeaders(),
			});
			await makeRequest('/meals', {
				method: 'POST',
				body: { date: '2020-09-01', meal_type: 'breakfast', description: 'Bagel' },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest('/meals?from=2020-04-01&to=2020-07-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();
			expect(data.meals.every((m: AnyJson) => m.date >= '2020-04-01' && m.date <= '2020-07-01')).toBe(true);
		});

		it('returns meals sorted by date ASC and meal_type order', async () => {
			const date = '2020-04-15';

			// Insert in reverse order
			await makeRequest('/meals', {
				method: 'POST',
				body: { date, meal_type: 'snack', description: 'Apple' },
				headers: createAuthHeaders(),
			});
			await makeRequest('/meals', {
				method: 'POST',
				body: { date, meal_type: 'breakfast', description: 'Toast' },
				headers: createAuthHeaders(),
			});
			await makeRequest('/meals', {
				method: 'POST',
				body: { date, meal_type: 'dinner', description: 'Steak' },
				headers: createAuthHeaders(),
			});
			await makeRequest('/meals', {
				method: 'POST',
				body: { date, meal_type: 'lunch', description: 'Sandwich' },
				headers: createAuthHeaders(),
			});

			const response = await makeRequest(`/meals?from=${date}&to=${date}`, {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(200);
			const data = await response.json<AnyJson>();

			const mealTypes = data.meals.map((m: AnyJson) => m.meal_type);
			expect(mealTypes).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
		});

		it('returns 400 for invalid days parameter', async () => {
			const response = await makeRequest('/meals?days=0', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid days parameter (must be a positive integer)');
		});

		it('returns 400 for invalid from format', async () => {
			const response = await makeRequest('/meals?from=invalid', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('Invalid from parameter (must be YYYY-MM-DD)');
		});

		it('returns 400 when from is after to', async () => {
			const response = await makeRequest('/meals?from=2020-12-01&to=2020-01-01', {
				headers: createAuthHeaders(),
			});
			expect(response.status).toBe(400);
			const data = await response.json<AnyJson>();
			expect(data.error).toBe('from must not be after to');
		});
	});
});
