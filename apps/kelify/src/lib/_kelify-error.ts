/**
 * Kelify API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * is the literal upstream Kelify message — never re-tuned. Only the
 * `action.description` (what the user/agent should do) is curated per code.
 */

export type KelifyIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface KelifyIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedKelifyError {
  code: KelifyIssueCode;
  action: KelifyIssueAction;
  /** Literal upstream Kelify message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Kelify error body.
 *
 * Kelify returns `{ error: "<human>" }` on most error responses. Some paths
 * use `message` or `error_description`. Order matters.
 */
export function extractKelifyMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      message?: unknown;
      error_description?: unknown;
      error?: unknown;
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.error) ?? pick(b.message) ?? pick(b.error_description) ?? fallback;
  }
  return fallback;
}

export function classifyKelifyError(
  status: number,
  body: unknown,
  fallbackMessage = 'Kelify API error',
): ClassifiedKelifyError {
  const message = extractKelifyMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Kelify API key is missing or invalid. Check the KELIFY_API_KEY system secret.',
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
        description: 'Resource not found — check the conversation id.',
      },
      message,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'Kelify rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Kelify rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Kelify API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Kelify API error.' },
    message,
  };
}

/**
 * Thrown by `kelifyRequest` on non-OK responses (and on a missing API key).
 * `message` is `[CODE] <upstream literal>`.
 */
export class KelifyApiError extends Error {
  readonly code: KelifyIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: KelifyIssueAction;

  constructor(
    code: KelifyIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: KelifyIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'KelifyApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
