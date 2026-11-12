/**
 * Homey API client.
 *
 * Manages OAuth2 tokens, API initialization, and caching for the Athom Cloud
 * API. Secrets are read from the AgentApps SDK context on every call.
 *
 * Token refresh: when a 401 is detected, the access token is refreshed via the
 * Athom token endpoint using `fetch` + `AbortController` (no safeFetch/withTimeout).
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HomeySecrets {
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  ACCESS_TOKEN?: string;
  REFRESH_TOKEN?: string;
  TOKEN_TYPE?: string;
  EXPIRES_IN?: string;
}

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

// =============================================================================
// TOKEN REFRESH
// =============================================================================

const ATHOM_TOKEN_ENDPOINT = 'https://api.athom.com/oauth2/token';
const TOKEN_REFRESH_TIMEOUT_MS = 15_000;

/**
 * Refresh the Athom Cloud OAuth2 access token using the refresh_token grant.
 * Returns the updated secrets object with new ACCESS_TOKEN / REFRESH_TOKEN.
 */
export async function refreshAccessToken(secrets: HomeySecrets): Promise<HomeySecrets> {
  const { CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } = secrets;

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Cannot refresh token: missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REFRESH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ATHOM_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  const updatedSecrets: HomeySecrets = {
    ...secrets,
    ACCESS_TOKEN: data.access_token,
    REFRESH_TOKEN: data.refresh_token ?? REFRESH_TOKEN,
    TOKEN_TYPE: data.token_type ?? 'bearer',
    EXPIRES_IN: String(data.expires_in ?? 3600),
  };

  return updatedSecrets;
}

/**
 * Execute an async operation with automatic 401 retry.
 *
 * If the operation throws and the error looks like a 401 / token-expired
 * response, we refresh the access token, invalidate all caches (forcing
 * re-init with the new token), and retry the operation once.
 */
export async function withTokenRefresh<T>(
  secrets: HomeySecrets,
  operation: (sec: HomeySecrets) => Promise<T>,
): Promise<T> {
  try {
    return await operation(secrets);
  } catch (error: any) {
    const msg = String(error?.message ?? error ?? '').toLowerCase();
    const status = error?.statusCode ?? error?.status ?? error?.code;
    const isAuthError =
      status === 401 ||
      msg.includes('401') ||
      msg.includes('unauthorized') ||
      msg.includes('token') ||
      msg.includes('invalid_grant');

    if (!isAuthError) throw error;

    // Refresh token and invalidate caches so initHomeyApi re-authenticates
    const freshSecrets = await refreshAccessToken(secrets);
    invalidateAllCaches();

    // Retry once with fresh secrets
    return await operation(freshSecrets);
  }
}

// =============================================================================
// CACHE WITH TTL
// =============================================================================

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const ZONES_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

let homeyApiCacheEntry: CacheEntry<any> | null = null;
export let homeyInstanceCache: any = null;
let zonesCacheEntry: CacheEntry<any> | null = null;

function isCacheValid<T>(entry: CacheEntry<T> | null, ttlMs: number): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.cachedAt < ttlMs;
}

/** Invalidate all caches — called on token refresh or health-check */
export function invalidateAllCaches(): void {
  homeyApiCacheEntry = null;
  homeyInstanceCache = null;
  zonesCacheEntry = null;
}

// =============================================================================
// HOMEY API FACTORY
// =============================================================================

/**
 * Initialize Homey API connection from secrets.
 * Creates a fresh AthomCloudAPI instance, injects the OAuth token, and
 * authenticates against the user's first Homey hub.
 */
export async function initHomeyApi(secrets: HomeySecrets) {
  const clientId = secrets.CLIENT_ID;
  const clientSecret = secrets.CLIENT_SECRET;
  const accessToken = secrets.ACCESS_TOKEN;
  const refreshToken = secrets.REFRESH_TOKEN;
  const tokenType = secrets.TOKEN_TYPE || 'bearer';
  const expiresIn = secrets.EXPIRES_IN ? parseInt(secrets.EXPIRES_IN, 10) : 3600;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Homey OAuth credentials not configured. Missing CLIENT_ID or CLIENT_SECRET in system secrets.',
    );
  }

  if (!accessToken || !refreshToken) {
    throw new Error('Homey account not connected. Please connect your Homey account.');
  }

  // Dynamic import — homey-api has no TypeScript definitions
  // @ts-expect-error
  const { default: AthomCloudAPI } = await import('homey-api/lib/AthomCloudAPI.js');

  const cloudApi = new AthomCloudAPI({ clientId, clientSecret });

  // Build Token instance and inject it (double underscore is the internal field)
  const Token = AthomCloudAPI.Token;
  const token = new Token({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenType,
    expires_in: expiresIn,
  });
  cloudApi.__token = token;

  // Get authenticated user and first Homey hub
  const user = await cloudApi.getAuthenticatedUser();
  const homey = await user.getFirstHomey();
  homeyInstanceCache = homey;

  // Authenticate to the local Homey instance
  const api = await homey.authenticate();

  // Store in cache with timestamp
  homeyApiCacheEntry = { data: api, cachedAt: Date.now() };
  zonesCacheEntry = null;

  return api;
}

/**
 * Get or initialize Homey API (with TTL-based cache — 5 min)
 */
export async function getHomeyApi(secrets: HomeySecrets) {
  if (isCacheValid(homeyApiCacheEntry, API_CACHE_TTL_MS)) {
    return homeyApiCacheEntry.data;
  }
  return await initHomeyApi(secrets);
}

/**
 * Get zones with TTL-based caching (2 min)
 */
export async function getZones(secrets: HomeySecrets) {
  if (isCacheValid(zonesCacheEntry, ZONES_CACHE_TTL_MS)) {
    return zonesCacheEntry.data;
  }
  const api = await getHomeyApi(secrets);
  const zones = await api.zones.getZones();
  zonesCacheEntry = { data: zones, cachedAt: Date.now() };
  return zones;
}

/**
 * Helper to get merged secrets from context.
 * Uses the new AgentApps SDK secret accessors.
 */
export async function getSecrets(ctx: SecretsContext): Promise<HomeySecrets> {
  const systemSecrets = (await ctx.secrets.getSystem()) ?? {};
  const installationSecrets = (await ctx.secrets.getInstallation()) ?? {};
  return { ...systemSecrets, ...installationSecrets };
}
