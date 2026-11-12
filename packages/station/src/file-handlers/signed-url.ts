/**
 * Signed temporary links for private Objects.
 *
 * A link token follows a JWT-like structure:
 *   token = base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))
 *
 * Payload: `{ objectId, expiresAt }`. The token is appended to the object's
 * URL as `?token=…`; the Station serves a private object only when the token
 * is valid, signed with its secret and not yet expired.
 *
 * The station secret is generated at startup (random) or configured via the
 * `AGENTAPPS_STATION_SECRET` env var. Set it in deployments so links survive
 * restarts.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Payload embedded in a link token. */
export interface ObjectLinkPayload {
  /** Object the link permissions access to. */
  objectId: string;
  /** ISO 8601 expiry timestamp. */
  expiresAt: string;
}

/** Result of validating a link token. */
export interface ObjectLinkValidationResult {
  valid: boolean;
  payload?: ObjectLinkPayload;
  /** Reason the token was rejected (when `valid` is false). */
  reason?: string;
}

/**
 * Resolve the station secret used for HMAC signing.
 *
 * Priority: explicit override, `AGENTAPPS_STATION_SECRET`, then a random
 * per-process secret.
 */
export function getStationSecret(override?: string): string {
  if (override) return override;
  const env = process.env.AGENTAPPS_STATION_SECRET;
  if (env) return env;
  return randomBytes(32).toString('hex');
}

/** Create a signed link token for an object that expires at `expiresAt`. */
export function createObjectLinkToken(payload: ObjectLinkPayload, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payloadB64).digest();
  return `${payloadB64}.${signature.toString('base64url')}`;
}

/**
 * Validate a link token: structure, signature and expiry.
 *
 * @returns `{ valid, payload }` on success, `{ valid: false, reason }` otherwise.
 */
export function validateObjectLinkToken(token: string, secret: string): ObjectLinkValidationResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false, reason: 'Invalid token format' };
  const [payloadB64, sigB64] = parts;

  const expected = createHmac('sha256', secret).update(payloadB64).digest();
  const provided = Buffer.from(sigB64, 'base64url');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  let payload: ObjectLinkPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'Invalid payload' };
  }
  if (typeof payload.objectId !== 'string' || typeof payload.expiresAt !== 'string') {
    return { valid: false, reason: 'Invalid payload' };
  }

  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return { valid: false, reason: 'Invalid expiry' };
  if (Date.now() >= expiresAt.getTime()) return { valid: false, reason: 'Token expired' };

  return { valid: true, payload };
}
