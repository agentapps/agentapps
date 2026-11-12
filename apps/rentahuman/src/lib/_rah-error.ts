/**
 * RentAHuman API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `RahApiError` is the LITERAL upstream RentAHuman message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 */

export type RahIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface RahIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedRahError {
  code: RahIssueCode;
  action: RahIssueAction;
  /** Literal upstream RentAHuman message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a RentAHuman error body.
 */
export function extractRahMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      message?: unknown;
      error?: unknown;
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? pick(b.error) ?? fallback;
  }
  return fallback;
}

export function classifyRahError(
  status: number,
  body: unknown,
  fallbackMessage = 'RentAHuman API error',
): ClassifiedRahError {
  const message = extractRahMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The RentAHuman API key is missing or invalid. Add your key (starts with rah_) in app settings.',
      },
      message,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      action: {
        type: 'user_action',
        description: 'The API key lacks permission for this resource.',
      },
      message,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found — check the id and whether it still exists.',
      },
      message,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'RentAHuman rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'RentAHuman rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'RentAHuman API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected RentAHuman API error.' },
    message,
  };
}

/**
 * Thrown by `rahRequest` on non-OK responses (and on a missing API key).
 */
export class RahApiError extends Error {
  readonly code: RahIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: RahIssueAction;

  constructor(
    code: RahIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: RahIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'RahApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
