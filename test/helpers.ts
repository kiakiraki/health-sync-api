import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Vitest pool binds API_KEY=dev-local-key via vitest.config.mts.
export const API_KEY = 'dev-local-key';

export function createAuthHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${API_KEY}`,
		'Content-Type': 'application/json',
	};
}

export async function makeRequest(
	path: string,
	options: {
		method?: string;
		body?: unknown;
		headers?: Record<string, string>;
		// When provided, the body is sent verbatim instead of being JSON-stringified.
		// Used for negative tests like "invalid JSON".
		rawBody?: string;
	} = {},
): Promise<Response> {
	const { method = 'GET', body, headers = {}, rawBody } = options;
	const request = new IncomingRequest(`http://example.com${path}`, {
		method,
		headers,
		body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
	});
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env);
	await waitOnExecutionContext(ctx);
	return response;
}
