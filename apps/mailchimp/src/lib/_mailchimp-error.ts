/**
 * Mailchimp API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `MailchimpApiError` is the LITERAL upstream Mailchimp message —
 * never re-tuned. Only the `action.description` (what the user/agent should do)
 * is curated per code.
 *
 * The thrown `MailchimpApiError.message` is prefixed with `[CODE]` so the LLM
 * can parse the bracket and decide what to do — the SDK only serializes
 * `error.message` to the model, dropping custom fields.
 */

export type MailchimpIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface MailchimpIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedMailchimpError {
  code: MailchimpIssueCode;
  action: MailchimpIssueAction;
  /** Literal upstream Mailchimp message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Mailchimp error body.
 *
 * Mailchimp returns `{ type, title, status, detail, instance }` on errors
 * (RFC 7807 problem details). We prefer `detail` (most descriptive), then
 * `title`, then fallback.
 */
export function extractMailchimpMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      detail?: unknown;
      title?: unknown;
      message?: unknown;
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.detail) ?? pick(b.title) ?? pick(b.message) ?? fallback;
  }
  return fallback;
}

export function classifyMailchimpError(
  status: number,
  body: unknown,
  fallbackMessage = 'Mailchimp API error',
): ClassifiedMailchimpError {
  const message = extractMailchimpMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Mailchimp API key is missing or invalid. Re-enter it from Mailchimp Account -> Extras -> API Keys.',
      },
      message,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      action: {
        type: 'user_action',
        description: 'The API key lacks permission for this resource or the account is disabled.',
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
        description: 'Mailchimp rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Mailchimp rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Mailchimp API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Mailchimp API error.' },
    message,
  };
}

/**
 * Thrown by `mailchimpRequest` on non-OK responses (and on a missing API key).
 * `message` is `[MAILCHIMP_ERROR] [CODE] <upstream literal>`;
 * `upstreamMessage` keeps the raw provider text for tests and structured consumers.
 */
export class MailchimpApiError extends Error {
  readonly code: MailchimpIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: MailchimpIssueAction;

  constructor(
    code: MailchimpIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: MailchimpIssueAction,
  ) {
    super(`[MAILCHIMP_ERROR] [${code}] ${upstreamMessage}`);
    this.name = 'MailchimpApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
