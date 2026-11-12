/**
 * Higgsfield API client.
 *
 * Stateless: API credentials are read from `ctx.secrets.getInstallation()` on every call.
 * Auth uses the `Key apiKey:apiSecret` header format.
 */

const HIGGSFIELD_API_URL = 'https://platform.higgsfield.ai';

export interface HiggsFieldCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

/**
 * Extract API credentials from installation secrets.
 *
 * Supports two formats:
 *   - Combined: `HF_KEY` = "key:secret"
 *   - Separate: `API_KEY` + `API_SECRET`
 */
export function getCredentials(secrets: Record<string, string>): HiggsFieldCredentials | null {
  const hfKey = secrets.HF_KEY || secrets.hf_key;
  if (hfKey?.includes(':')) {
    const [apiKey, apiSecret] = hfKey.split(':');
    return { apiKey, apiSecret };
  }

  const apiKey = secrets.API_KEY || secrets.api_key || secrets.apiKey;
  const apiSecret = secrets.API_SECRET || secrets.api_secret || secrets.apiSecret;

  if (apiKey && apiSecret) {
    return { apiKey, apiSecret };
  }

  return null;
}

/**
 * Resolve credentials from a secrets context, throwing if not configured.
 */
export async function resolveCredentials(ctx: SecretsContext): Promise<HiggsFieldCredentials> {
  let secrets: Record<string, string> = {};
  try {
    const installationSecrets = await ctx.secrets.getInstallation();
    if (installationSecrets) secrets = installationSecrets;
  } catch {
    // fall through
  }

  const credentials = getCredentials(secrets);
  if (!credentials) {
    throw new Error(
      'Higgsfield API credentials not configured. Add API_KEY and API_SECRET in the app settings.',
    );
  }
  return credentials;
}

/**
 * Make an authenticated request to the Higgsfield API.
 */
export async function higgsFieldRequest(
  endpoint: string,
  credentials: HiggsFieldCredentials,
  options: RequestInit = {},
): Promise<Response> {
  const authKey = `${credentials.apiKey}:${credentials.apiSecret}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    return await fetch(`${HIGGSFIELD_API_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${authKey}`,
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Poll for request completion with progress updates.
 */
export async function pollRequestWithProgress(
  requestId: string,
  credentials: HiggsFieldCredentials,
  onProgress?: (status: string) => void,
  maxAttempts: number = 120,
): Promise<unknown> {
  let attempts = 0;
  let lastStatus = '';

  while (attempts < maxAttempts) {
    const response = await higgsFieldRequest(`/requests/${requestId}/status`, credentials);

    if (!response.ok) {
      throw new Error(`Failed to poll request: ${response.statusText}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const data = result.data as Record<string, unknown> | undefined;
    const status = (result.status as string) || (data?.status as string) || '';

    if (status !== lastStatus && onProgress) {
      onProgress(status);
      lastStatus = status;
    }

    if (status === 'completed' || status === 'Completed') {
      return result;
    }

    if (
      status === 'failed' ||
      status === 'Failed' ||
      status === 'cancelled' ||
      status === 'Cancelled'
    ) {
      const errorMsg = (result.error as string) || (result.message as string) || 'Unknown error';
      throw new Error(`Request ${status}: ${errorMsg}`);
    }

    if (status === 'nsfw' || status === 'NSFW') {
      throw new Error('Request blocked: NSFW content detected');
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error('Request timed out after 10 minutes');
}

/**
 * Submit a request to a Higgsfield model endpoint.
 */
export async function submitRequest(
  model: string,
  args: Record<string, unknown>,
  credentials: HiggsFieldCredentials,
): Promise<Record<string, unknown>> {
  const response = await higgsFieldRequest(`/${model}`, credentials, {
    method: 'POST',
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} ${errorText}`);
  }

  return (await response.json()) as Record<string, unknown>;
}
