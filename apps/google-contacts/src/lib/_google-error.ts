/**
 * Google People API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `GoogleApiError` is the LITERAL upstream Google message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 *
 * The thrown `GoogleApiError.message` is prefixed with `[CODE]` so the LLM can
 * parse the bracket and decide what to do.
 */

export type GoogleIssueCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'PROVIDER_ERROR';

export interface GoogleIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedGoogleError {
  code: GoogleIssueCode;
  action: GoogleIssueAction;
  /** Literal upstream Google message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Google API error body.
 *
 * Google returns `{ error: { message: "...", code: N, status: "..." } }` on
 * most errors. Some paths use a plain `{ message: "..." }` or just a string.
 */
export function extractGoogleMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    // Nested error object (most Google API responses)
    if (b.error && typeof b.error === 'object') {
      const err = b.error as Record<string, unknown>;
      if (typeof err.message === 'string' && err.message.trim()) return err.message;
    }
    if (typeof b.message === 'string' && b.message.trim()) return b.message;
    if (typeof b.error === 'string' && b.error.trim()) return b.error;
  }
  return fallback;
}

export function classifyGoogleError(
  status: number,
  body: unknown,
  fallbackMessage = 'Google API error',
): ClassifiedGoogleError {
  const message = extractGoogleMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_EXPIRED',
      action: {
        type: 'user_action',
        description: 'Google access token expired or revoked. Reconnect your Google account.',
      },
      message,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      action: {
        type: 'user_action',
        description:
          'The OAuth token lacks permission for this operation, or the Google API quota is exceeded.',
      },
      message,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found — check the resource name and whether it still exists.',
      },
      message,
    };
  }
  if (status === 409) {
    return {
      code: 'CONFLICT',
      action: {
        type: 'user_action',
        description:
          'Conflict — the resource may have been modified concurrently. Retry with a fresh etag.',
      },
      message,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'Google API rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Google rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Google API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Google API error.' },
    message,
  };
}

/**
 * Thrown by `googlePeopleRequest` on non-OK responses (and on a missing access token).
 */
export class GoogleApiError extends Error {
  readonly code: GoogleIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: GoogleIssueAction;

  constructor(
    code: GoogleIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: GoogleIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'GoogleApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
