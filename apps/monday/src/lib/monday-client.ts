/**
 * Monday.com GraphQL API client.
 *
 * Stateless: the API token is read from `ctx.secrets.getInstallation()` on every call
 * (per-app container -- each user's own token). Auth is a plain header
 * (`Authorization: <token>`). Destination is the fixed host `api.monday.com`,
 * so a plain `fetch` is safe -- no SSRF surface, no `safeFetch` needed.
 *
 * All Monday.com API calls go through their GraphQL v2 endpoint. Mutations are
 * NOT retried -- without an idempotency key a retry could duplicate data.
 * Queries (which are still POST to the GraphQL endpoint) are retried on
 * transient errors (429/5xx).
 */

import { classifyMondayError, MondayApiError } from './monday-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const MONDAY_API_URL = 'https://api.monday.com/v2';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

async function getApiToken(context: SecretsContext): Promise<string> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await context.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through to the missing-token error below
  }
  const token = secrets.MONDAY_API_TOKEN;
  if (!token || token.trim().length === 0) {
    throw new MondayApiError('AUTH_INVALID', 401, 'Monday.com API token not configured.', {
      type: 'user_action',
      description: 'Add your Monday.com API token in the app settings (Monday.com > Admin > API).',
    });
  }
  return token.trim();
}

function backoffMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  const base = 800 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, MAX_RETRY_AFTER_MS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Execute a Monday.com GraphQL request. Returns the `data` portion of the
 * response. Throws `MondayApiError` on HTTP errors or GraphQL errors.
 *
 * @param isQuery - Set to `true` for read-only queries (enables retry on
 *   transient errors). Set to `false` for mutations (no retry).
 */
export async function mondayRequest(
  context: SecretsContext,
  query: string,
  variables?: Record<string, unknown>,
  isQuery = true,
): Promise<any> {
  const apiToken = await getApiToken(context);

  const doFetch = (): Promise<Response> =>
    fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiToken,
      },
      body: JSON.stringify({ query, variables }),
    });

  const maxAttempts = isQuery ? MAX_RETRIES + 1 : 1;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await doFetch();

    if (response.ok) {
      const data = await response.json();

      // Monday GraphQL can return 200 with errors in the body
      if (data.errors && data.errors.length > 0) {
        throw new MondayApiError(
          'BAD_REQUEST',
          200,
          data.errors.map((e: { message: string }) => e.message).join('; '),
          { type: 'user_action', description: 'Monday.com rejected the query -- see the message.' },
        );
      }

      return data.data;
    }

    lastResponse = response;
    const canRetry = attempt < maxAttempts - 1 && RETRYABLE_STATUS.has(response.status);
    if (!canRetry) break;
    await sleep(backoffMs(attempt, response.headers.get('retry-after')));
  }

  // Non-OK after (optional) retries -- classify + throw.
  const response = lastResponse as Response;
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // keep raw text for the message
  }
  const classified = classifyMondayError(response.status, parsed);
  throw new MondayApiError(classified.code, response.status, classified.message, classified.action);
}
