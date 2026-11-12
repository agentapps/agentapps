/**
 * Asana API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `AsanaApiError` is the LITERAL upstream Asana message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 */

export type AsanaIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface AsanaIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedAsanaError {
  code: AsanaIssueCode;
  action: AsanaIssueAction;
  /** Literal upstream Asana message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of an Asana error body.
 *
 * Asana typically returns `{ errors: [{ message: "..." }] }`.
 */
export function extractAsanaMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as { errors?: Array<{ message?: string }>; message?: unknown };
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      const msg = b.errors[0]?.message;
      if (typeof msg === 'string' && msg.trim().length > 0) return msg;
    }
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? fallback;
  }
  return fallback;
}

export function classifyAsanaError(
  status: number,
  body: unknown,
  fallbackMessage = 'Asana API error',
): ClassifiedAsanaError {
  const message = extractAsanaMessage(body, fallbackMessage);

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Asana access token is missing or invalid. Re-enter it from Asana → My Settings → Apps → Personal Access Tokens.',
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
        description: 'Asana rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: { type: 'user_action', description: 'Asana rejected the request — see the message.' },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Asana API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Asana API error.' },
    message,
  };
}

/**
 * Thrown by `asanaRequest` on non-OK responses (and on a missing access token).
 * `message` is `[CODE] <upstream literal>`; `upstreamMessage` keeps the raw
 * provider text for tests and structured consumers.
 */
export class AsanaApiError extends Error {
  readonly code: AsanaIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: AsanaIssueAction;

  constructor(
    code: AsanaIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: AsanaIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'AsanaApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
