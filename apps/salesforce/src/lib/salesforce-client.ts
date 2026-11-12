/**
 * Salesforce REST API client.
 *
 * Stateless: the access token and instance URL are read from `ctx.secrets.getInstallation()`
 * on every call (per-app container, each user's own OAuth token).
 *
 * Base URL: `${INSTANCE_URL}/services/data/v59.0/`
 * Auth: `Authorization: Bearer ${ACCESS_TOKEN}`
 */

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const API_VERSION = 'v59.0';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

// =============================================================================
// HELPERS
// =============================================================================

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getRetryDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    }
  }
  const base = BASE_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(base + jitter, MAX_RETRY_AFTER_MS);
}

// =============================================================================
// AUTH
// =============================================================================

/**
 * Read ACCESS_TOKEN and INSTANCE_URL from installation secrets.
 * Throws with `[SALESFORCE_ERROR]` prefix if missing.
 */
export async function getSalesforceAuth(ctx: SecretsContext): Promise<{
  accessToken: string;
  instanceUrl: string;
}> {
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  const accessToken = installationSecrets.ACCESS_TOKEN;
  const instanceUrl = installationSecrets.INSTANCE_URL;

  if (!accessToken) {
    throw new Error(
      '[SALESFORCE_ERROR] Salesforce account not connected. Please connect your Salesforce account via OAuth.',
    );
  }

  if (!instanceUrl) {
    throw new Error(
      '[SALESFORCE_ERROR] Salesforce instance URL not configured. Please set INSTANCE_URL (e.g., https://mycompany.my.salesforce.com).',
    );
  }

  return { accessToken, instanceUrl };
}

// =============================================================================
// REQUEST
// =============================================================================

/**
 * Make an authenticated request to the Salesforce REST API with retry and backoff.
 *
 * @param method  HTTP method (GET, POST, PATCH, DELETE)
 * @param path    Relative path under `/services/data/v59.0/` (e.g. `sobjects/Account/123`)
 * @param body    Optional request body (will be JSON-stringified)
 * @param ctx     Secrets context
 */
export async function salesforceRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown | undefined,
  ctx: SecretsContext,
): Promise<unknown> {
  const { accessToken, instanceUrl } = await getSalesforceAuth(ctx);

  // Build full URL
  const baseUrl = instanceUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/services/data/${API_VERSION}/${path}`;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      // Handle rate limiting (429)
      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = getRetryDelay(attempt, response.headers.get('Retry-After'));
          await sleep(delay);
          continue;
        }
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `[SALESFORCE_ERROR] Rate limit exceeded after ${MAX_RETRIES} retries: ${errorText}`,
        );
      }

      // Handle server errors (5xx) with retry
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = getRetryDelay(attempt, response.headers.get('Retry-After'));
        await sleep(delay);
        continue;
      }

      // Handle errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        let errorMessage: string;
        try {
          const errorJson = JSON.parse(errorText);
          if (Array.isArray(errorJson) && errorJson.length > 0) {
            errorMessage = errorJson[0].message || errorText;
          } else {
            errorMessage = errorJson.message || errorJson.error || errorText;
          }
        } catch {
          errorMessage = errorText;
        }
        throw new Error(`[SALESFORCE_ERROR] API error ${response.status}: ${errorMessage}`);
      }

      // 204 No Content (e.g. successful DELETE)
      if (response.status === 204) return { success: true };

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's our own SALESFORCE_ERROR (non-retryable)
      if (lastError.message.startsWith('[SALESFORCE_ERROR]')) {
        throw lastError;
      }

      if (attempt >= MAX_RETRIES) break;

      // Retry on network/abort errors
      if (
        lastError.name === 'AbortError' ||
        lastError.message.includes('fetch') ||
        lastError.message.includes('network')
      ) {
        const delay = getRetryDelay(attempt, null);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  throw lastError || new Error('[SALESFORCE_ERROR] Request failed after retries');
}

/**
 * Validate Salesforce credentials by calling the API version endpoint.
 */
export async function validateCredentials(ctx: SecretsContext): Promise<void> {
  await salesforceRequest('GET', '', undefined, ctx);
}
