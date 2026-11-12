/**
 * Intercom API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `IntercomApiError` is the LITERAL upstream Intercom message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 *
 * The thrown `IntercomApiError.message` is prefixed with `[CODE]` so the LLM can
 * parse the bracket and decide what to do — the SDK only serializes
 * `error.message` to the model, dropping custom fields.
 */

export type IntercomIssueCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface IntercomIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedIntercomError {
  code: IntercomIssueCode;
  action: IntercomIssueAction;
  /** Literal upstream Intercom message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of an Intercom error body.
 *
 * Intercom returns `{ type: "error.list", errors: [{ code, message }] }` on
 * most errors. Some gateway/5xx paths use a plain string or other shapes.
 */
export function extractIntercomMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      errors?: unknown[];
      message?: unknown;
      error_description?: unknown;
    };
    // Try the errors array first (standard Intercom error shape)
    if (Array.isArray(b.errors) && b.errors.length > 0) {
      const first = b.errors[0] as { message?: unknown };
      if (typeof first.message === 'string' && first.message.trim().length > 0) {
        return first.message;
      }
    }
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? pick(b.error_description) ?? fallback;
  }
  return fallback;
}

export function classifyIntercomError(
  status: number,
  body: unknown,
  fallbackMessage = 'Intercom API error',
): ClassifiedIntercomError {
  const message = extractIntercomMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Intercom access token is missing or invalid. Re-enter it from the Intercom Developer Hub.',
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
          'The access token lacks permission for this resource. Check the scopes in the Intercom Developer Hub.',
      },
      message,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found — check the ID and whether it still exists.',
      },
      message,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      action: {
        type: 'auto_retry',
        description: 'Intercom rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Intercom rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Intercom API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Intercom API error.' },
    message,
  };
}

/**
 * Thrown by `intercomRequest` on non-OK responses (and on a missing access token).
 * `message` is `[CODE] <upstream literal>`; `upstreamMessage` keeps the raw
 * provider text for tests and structured consumers.
 */
export class IntercomApiError extends Error {
  readonly code: IntercomIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: IntercomIssueAction;

  constructor(
    code: IntercomIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: IntercomIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'IntercomApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
