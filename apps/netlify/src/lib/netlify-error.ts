/**
 * Netlify API error classification.
 *
 * Maps HTTP status + response body to a typed error with `[CODE]` prefix so the
 * agent can branch on `[AUTH_INVALID]` / `[RATE_LIMITED]` / `[NOT_FOUND]`.
 */

export type NetlifyErrorCode =
  | 'AUTH_INVALID'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'REQUEST_FAILED'
  | 'NETWORK_ERROR'
  | 'CANCELLED';

export class NetlifyApiError extends Error {
  readonly code: NetlifyErrorCode;
  readonly httpStatus?: number;
  /** Upstream message, unmodified (the `[CODE]` prefix lives on `message`). */
  readonly upstreamMessage: string;

  constructor(code: NetlifyErrorCode, upstreamMessage: string, httpStatus?: number) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'NetlifyApiError';
    this.code = code;
    this.upstreamMessage = upstreamMessage;
    this.httpStatus = httpStatus;
  }
}

export function classify(status: number): NetlifyErrorCode {
  if (status === 401 || status === 403) return 'AUTH_INVALID';
  if (status === 404) return 'NOT_FOUND';
  if (status === 422) return 'INVALID_REQUEST';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'REQUEST_FAILED';
}

/**
 * Pull a human message out of a Netlify error body. Netlify returns JSON like
 * `{ "code": 404, "message": "Not Found" }` or `{ "error": "..." }`, but some
 * endpoints return plain text — fall back to the raw body / statusText.
 */
export function extractMessage(body: string, fallback: string): string {
  const trimmed = body.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = parsed.message ?? parsed.error ?? parsed.error_description;
      if (typeof msg === 'string' && msg.length > 0) return msg;
    } catch {
      // Not JSON — use the raw text below.
    }
    return trimmed;
  }
  return fallback;
}
