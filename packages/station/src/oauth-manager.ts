/**
 * OAuthManager — server-side OAuth flow for the app station.
 *
 * Manages pending authorization requests and handles the token exchange
 * when the provider redirects back to the app station's public callback
 * endpoint. Supports multiple concurrent users and apps on the same
 * app station instance.
 *
 * Flow:
 *   1. Client calls GET /auth/start → OAuthManager generates the authorize
 *      URL and stores a pending entry keyed by a random `state`.
 *   2. User completes consent in the browser → provider redirects to
 *      GET /auth/callback?code=X&state=Y.
 *   3. OAuthManager exchanges the code for tokens and returns them so the
 *      server can persist them via the SecretsManager.
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthStartParams {
  /** Unique installation ID (e.g. "ins_a7f3b2c1"). Used for token storage. */
  installationId: string;
  /** App type ID (e.g. "app.google.gmail"). Used for app manifest lookup. */
  appId: string;
  /** Tenant context — who initiated the auth. */
  tenant?: { userId: string; workspaceId?: string };
  /** Provider name (e.g. "google", "github", "notion"). */
  provider: string;
  /** Full authorize URL (e.g. https://accounts.google.com/o/oauth2/v2/auth). */
  authorizeUrl: string;
  /** Token endpoint URL. */
  tokenUrl: string;
  /** OAuth client ID. */
  clientId: string;
  /** OAuth client secret. */
  clientSecret: string;
  /** Where the provider should redirect after consent. */
  redirectUri: string;
  /** Requested scopes. */
  scopes?: string[];
}

export interface PendingAuth {
  params: OAuthStartParams;
  state: string;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export interface OAuthTokens {
  ACCESS_TOKEN: string;
  REFRESH_TOKEN?: string;
  EXPIRY_DATE?: string;
}

export interface OAuthCallbackResult {
  installationId: string;
  appId: string;
  tenant?: { userId: string; workspaceId?: string };
  provider: string;
  tokens: OAuthTokens;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pending auth entries expire after 10 minutes. */
const PENDING_TTL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// OAuthManager
// ---------------------------------------------------------------------------

export class OAuthManager {
  private pending = new Map<string, PendingAuth>();

  /**
   * Start a new OAuth flow.
   *
   * Generates a cryptographically random `state`, stores the pending auth
   * entry, and returns the full authorization URL the user should visit.
   */
  startAuth(params: OAuthStartParams): { url: string; state: string } {
    const state = randomBytes(32).toString('hex');

    // Build the authorization URL
    const url = new URL(params.authorizeUrl);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('redirect_uri', params.redirectUri);

    if (params.scopes && params.scopes.length > 0) {
      url.searchParams.set('scope', params.scopes.join(' '));
    }

    // Google requires these for a refresh token on first consent.
    if (params.provider.toUpperCase() === 'GOOGLE') {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    }

    // Auto-expire after TTL
    const timer = setTimeout(() => {
      this.pending.delete(state);
    }, PENDING_TTL_MS);

    this.pending.set(state, {
      params,
      state,
      createdAt: Date.now(),
      timer,
    });

    return { url: url.toString(), state };
  }

  /**
   * Handle an OAuth callback.
   *
   * Validates the state, exchanges the authorization code for tokens,
   * and cleans up the pending entry.
   */
  async handleCallback(state: string, code: string): Promise<OAuthCallbackResult> {
    const entry = this.pending.get(state);
    if (!entry) {
      throw new Error('Invalid or expired OAuth state. Please start the authentication again.');
    }

    // Clean up immediately
    clearTimeout(entry.timer);
    this.pending.delete(state);

    const { params } = entry;

    // Exchange code for tokens
    const tokens = await this.exchangeCode(params, code);

    return {
      installationId: params.installationId,
      appId: params.appId,
      tenant: params.tenant,
      provider: params.provider,
      tokens,
    };
  }

  /** Check whether a pending auth exists for the given state. */
  hasPending(state: string): boolean {
    return this.pending.has(state);
  }

  /** Number of active pending auth flows. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Clean up all pending entries (e.g. on server shutdown). */
  dispose(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
    }
    this.pending.clear();
  }

  // -------------------------------------------------------------------------
  // Token exchange
  // -------------------------------------------------------------------------

  private async exchangeCode(params: OAuthStartParams, code: string): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: params.redirectUri,
    });

    // Send credentials both in body and as Basic Auth header — some
    // providers expect one, some expect the other. Sending both is safe
    // per RFC 6749 §2.3.1.
    const basicAuth = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64');
    body.set('client_id', params.clientId);
    body.set('client_secret', params.clientSecret);

    const response = await fetch(params.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown error');
      throw new Error(`Token exchange failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.access_token as string | undefined;
    if (!accessToken) {
      throw new Error('Token exchange response missing access_token');
    }

    const refreshToken = data.refresh_token as string | undefined;
    const expiresIn = data.expires_in as number | undefined;
    const expiresAt =
      typeof expiresIn === 'number'
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : undefined;

    const tokens: OAuthTokens = { ACCESS_TOKEN: accessToken };
    if (refreshToken) tokens.REFRESH_TOKEN = refreshToken;
    if (expiresAt) tokens.EXPIRY_DATE = expiresAt;

    return tokens;
  }
}
