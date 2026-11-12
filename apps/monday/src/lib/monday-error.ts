/**
 * Monday.com API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `MondayApiError` is the LITERAL upstream Monday message -- never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 */

export type MondayIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface MondayIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedMondayError {
  code: MondayIssueCode;
  action: MondayIssueAction;
  /** Literal upstream Monday message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Monday error body.
 *
 * Monday GraphQL returns `{ errors: [{ message }] }` on query errors,
 * and standard HTTP errors on auth/rate-limit failures.
 */
export function extractMondayMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      message?: unknown;
      error_message?: unknown;
      error_code?: unknown;
      errors?: unknown[];
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    // GraphQL errors array
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      const first = b.errors[0] as { message?: unknown };
      const msg = pick(first?.message);
      if (msg) return msg;
    }
    return pick(b.message) ?? pick(b.error_message) ?? pick(b.error_code) ?? fallback;
  }
  return fallback;
}

export function classifyMondayError(
  status: number,
  body: unknown,
  fallbackMessage = 'Monday.com API error',
): ClassifiedMondayError {
  const message = extractMondayMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Monday.com API token is missing or invalid. Re-enter it from Monday.com Admin > API.',
      },
      message,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      action: {
        type: 'user_action',
        description: 'The API token lacks permission for this resource.',
      },
      message,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found -- check the id and whether it still exists.',
      },
      message,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'Monday.com rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Monday.com rejected the request -- see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Monday.com API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Monday.com API error.' },
    message,
  };
}

/**
 * Thrown by `mondayRequest` on non-OK responses (and on a missing API token).
 */
export class MondayApiError extends Error {
  readonly code: MondayIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: MondayIssueAction;

  constructor(
    code: MondayIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: MondayIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'MondayApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
