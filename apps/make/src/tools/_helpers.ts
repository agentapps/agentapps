/**
 * Shared helpers for app.make tool handlers (account API tools only). Kept in a
 * single `_helpers.ts` so the secret/region resolution stays consistent across
 * all scenario tools.
 */

import { MakeError } from '../lib/errors.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

/** Read installation secrets, tolerating a backend that hasn't provisioned any yet. */
export async function getUserSecretsSafe(ctx: SecretsContext): Promise<Record<string, string>> {
  try {
    return (await ctx.secrets.getInstallation()) ?? {};
  } catch (err) {
    console.error(
      '[app.make] secrets.getInstallation() failed — cannot read installation secrets:',
      err instanceof Error ? err.message : String(err),
    );
    return {};
  }
}

/**
 * Require the account API token. Throws `[AUTH_REQUIRED]` (not a transient
 * failure) with a message that distinguishes the account API from the
 * always-available webhook trigger.
 */
export function requireApiToken(secrets: Record<string, string>): string {
  const token = secrets.MAKE_API_TOKEN ?? secrets.make_api_token;
  if (!token || token.trim().length === 0) {
    throw new MakeError(
      'AUTH_REQUIRED',
      'MAKE_API_TOKEN is not configured. Add it in installation secrets to use the Make account API (scenarios). The trigger-webhook tool works without a token.',
    );
  }
  return token.trim();
}

/** Clamp an optional numeric limit into `[1, max]`, defaulting when absent/invalid. */
export function clampLimit(limit: unknown, fallback = 50, max = 100): number {
  const n = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Clamp an optional numeric offset into `[0, Infinity)`, defaulting to 0 when absent/invalid. */
export function clampOffset(offset: unknown): number {
  const n = typeof offset === 'number' ? offset : Number(offset);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}
