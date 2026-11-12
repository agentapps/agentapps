/**
 * Shared types and helpers for the Google Calendar app.
 */

export const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; responseStatus?: string }[];
  htmlLink?: string;
  status?: string;
  created?: string;
  updated?: string;
}

export interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleCalendarListResponse {
  items?: { id: string; summary?: string; primary?: boolean; timeZone?: string }[];
}

export interface ValidatedTokens {
  accessToken: string;
  refreshToken: string | undefined;
  expiresAt: number;
}

export interface AuthContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
    updateInstallation: (secrets: Record<string, string>) => Promise<void>;
  };
  requestAuth: (options: {
    provider: string;
    scopes?: string[];
    timeoutMs?: number;
  }) => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }>;
  auth: {
    refresh: () => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
  };
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

/**
 * Parse a stored `expiresAt` to epoch milliseconds.
 *
 * The host persists ISO 8601 timestamps; older app-side refreshes stored epoch
 * milliseconds. Accept both so an expiry is never silently treated as valid.
 * Returns 0 (i.e. "expired") when the value is missing or unparseable.
 */
export function expiryToMs(value: string | undefined): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Build a Calendar API request with bearer auth and optional JSON body. */
export async function googleCalendarFetch<T>(
  accessToken: string,
  path: string,
  options: { method?: string; body?: Record<string, unknown>; query?: URLSearchParams } = {},
): Promise<T> {
  const query = options.query ? `?${options.query.toString()}` : '';
  const url = `${GOOGLE_CALENDAR_API_BASE}${path}${query}`;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  };

  const resp = await fetch(url, init);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Calendar API error ${resp.status}: ${text}`);
  }
  // 204 No Content and empty bodies cannot be parsed as JSON.
  if (resp.status === 204) {
    return undefined as T;
  }
  const text = await resp.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Ensure we have a valid access token.
 *
 * If no user token exists, triggers ctx.requestAuth(): the host runs the OAuth
 * flow and returns the tokens, which the app persists via ctx.secrets.updateInstallation().
 *
 * If the persisted access token is expired, asks the host to refresh it via
 * ctx.auth.refresh(). The host owns the token exchange and persistence, so the
 * client secret never leaves the host and concurrent instances don't race.
 */
export async function ensureAuthenticated(ctx: AuthContext): Promise<ValidatedTokens> {
  const system = await ctx.secrets.getSystem();
  if (!system?.CLIENT_ID || !system?.CLIENT_SECRET) {
    throw new Error('Missing Google OAuth system secrets (CLIENT_ID / CLIENT_SECRET)');
  }

  const user = await ctx.secrets.getInstallation();

  // No persisted user tokens → let the host run OAuth and return tokens.
  if (!user?.ACCESS_TOKEN) {
    ctx.log('info', 'No access token found, requesting host OAuth flow');
    const authResult = await ctx.requestAuth({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const now = Date.now();
    const expiresAt = authResult.expiresAt ? authResult.expiresAt.getTime() : now + 3600 * 1000;

    await ctx.secrets.updateInstallation({
      ACCESS_TOKEN: authResult.accessToken,
      ...(authResult.refreshToken ? { REFRESH_TOKEN: authResult.refreshToken } : {}),
      expiresAt: String(expiresAt),
    });

    return {
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
      expiresAt,
    };
  }

  // Access token expired → ask the host to refresh (centralized, no client
  // secret in the app, no races between instances).
  const expiresAt = expiryToMs(user.expiresAt);
  if (Date.now() >= expiresAt - 60_000) {
    if (!user.REFRESH_TOKEN) {
      throw new Error('Access token expired and no refresh token available. Re-authenticate.');
    }

    ctx.log('info', 'Access token expired, refreshing via host');
    const refreshed = await ctx.auth.refresh();

    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? user.REFRESH_TOKEN,
      expiresAt: refreshed.expiresAt ? expiryToMs(refreshed.expiresAt) : Date.now() + 3600 * 1000,
    };
  }

  return {
    accessToken: user.ACCESS_TOKEN,
    refreshToken: user.REFRESH_TOKEN,
    expiresAt,
  };
}
