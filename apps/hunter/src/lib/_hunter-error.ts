/**
 * Hunter.io error mapping.
 *
 * The SDK only serializes `error.message` back to the LLM (the custom
 * `code`/`httpStatus` fields are lost in transport). Workaround: prepend
 * `[CODE]` to the message so the model can parse the bracket and decide to
 * retry / reconnect / ask the user, while `upstreamMessage` keeps the literal
 * Hunter text for tests + debugging.
 */

export type HunterIssueCode =
  | 'AUTH_INVALID'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'PENDING'
  | 'PROVIDER_ERROR';

export interface HunterIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedHunterError {
  code: HunterIssueCode;
  action: HunterIssueAction;
  /** Literal upstream Hunter message. Never edited. */
  message: string;
}

/** Hunter error body shape: `{ errors: [{ id, code, details }] }`. */
interface HunterErrorBody {
  errors?: Array<{ id?: string; code?: number | string; details?: string }>;
}

/**
 * Extract a human-readable message from a Hunter error body, falling back to a
 * truncated raw body when the shape is unexpected.
 */
export function extractHunterMessage(
  rawBody: string,
  httpStatus: number,
): { id?: string; message: string } {
  let parsed: HunterErrorBody | undefined;
  try {
    parsed = JSON.parse(rawBody) as HunterErrorBody;
  } catch {
    parsed = undefined;
  }

  const first = parsed?.errors?.[0];
  if (first?.details) {
    return { id: first.id, message: first.details };
  }

  const trimmed = rawBody.trim();
  return {
    message: trimmed ? trimmed.slice(0, 200) : `Hunter API returned HTTP ${httpStatus}`,
  };
}

/**
 * Map an HTTP status + raw error body to a classified error. Pure — no I/O,
 * unit-testable.
 */
export function classifyHunterError(
  httpStatus: number,
  rawBody: string,
  fallbackMessage = 'Hunter API error',
): ClassifiedHunterError {
  const { message } = extractHunterMessage(rawBody, httpStatus);
  const msg = message || fallbackMessage;

  if (httpStatus === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Hunter API key is missing or invalid. Re-enter it from hunter.io/api-keys.',
      },
      message: msg,
    };
  }

  // Hunter's documented scheme (api-documentation/v2):
  //   403 = rate limit reached (transient, per-second/minute) -> retryable
  //   429 = monthly usage/credit limit reached -> NOT retryable
  // (This is the OPPOSITE of the usual convention — do not "fix" it back.)
  if (httpStatus === 403) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'Hunter rate limit hit; retry after a short delay.',
      },
      message: msg,
    };
  }

  if (httpStatus === 429) {
    return {
      code: 'QUOTA_EXCEEDED',
      action: {
        type: 'user_action',
        description:
          'Monthly Hunter credit limit reached. Upgrade your plan or wait for the monthly reset.',
      },
      message: msg,
    };
  }

  if (httpStatus === 404) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found — check the input and try again.',
      },
      message: msg,
    };
  }

  if (httpStatus === 400 || httpStatus === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Hunter rejected the request — see the message.',
      },
      message: msg,
    };
  }

  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Hunter API temporarily unavailable.' },
    message: msg,
  };
}

/**
 * Thrown by `hunterRequest` on non-OK responses (and on a missing API key).
 * `message` is `[CODE] <upstream literal>`; `upstreamMessage` keeps the raw
 * provider text for tests and structured consumers.
 */
export class HunterApiError extends Error {
  readonly code: HunterIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: HunterIssueAction;

  constructor(
    code: HunterIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: HunterIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'HunterApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
