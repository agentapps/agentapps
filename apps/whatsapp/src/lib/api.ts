/**
 * Shared WAHA API helpers for whatsapp agent app tools.
 *
 * WAHA runs on localhost:${WAHA_PORT} inside the same container.
 * The API key and port are read from system secrets on every call
 * (per-app container). A plain `fetch` is safe — destination is always
 * localhost, no SSRF surface.
 */

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

const WAHA_TIMEOUT_MS = 30_000;

async function getWahaConfig(
  ctx: SecretsContext,
): Promise<{ base: string; key: string; port: string }> {
  // Fast path: if env vars are set (Docker mode), skip the secrets callback
  // entirely. This avoids a 30s timeout per call when no host is connected.
  const envKey = process.env.WAHA_API_KEY;
  const envPort = process.env.WAHA_PORT;
  if (envKey || envPort) {
    const port = envPort || '3001';
    const key = envKey || '';
    return { base: `http://localhost:${port}/api`, key, port };
  }

  // Slow path: fetch from host secrets (when running via controller with a host)
  let secrets: Record<string, string> = {};
  try {
    const systemSecrets = await ctx.secrets.getSystem();
    if (systemSecrets) secrets = systemSecrets;
  } catch {
    // fall through to defaults
  }
  const port = secrets.WAHA_PORT || '3001';
  const key = secrets.WAHA_API_KEY || '';
  const base = `http://localhost:${port}/api`;
  return { base, key, port };
}

function wahaHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  }
  return headers;
}

/**
 * Fetch from WAHA with timeout via AbortController.
 * Replaces the old safeFetch/withTimeout pattern.
 */
export async function wahaFetch(
  ctx: SecretsContext,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const config = await getWahaConfig(ctx);
  const url = path.startsWith('http') ? path : `${config.base}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAHA_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...wahaHeaders(config.key),
        ...(init?.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get the WAHA port for constructing media URLs.
 */
export async function getWahaPort(ctx: SecretsContext): Promise<string> {
  const config = await getWahaConfig(ctx);
  return config.port;
}
