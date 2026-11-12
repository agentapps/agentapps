/**
 * Zendesk API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `ZendeskApiError` is the LITERAL upstream Zendesk message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 *
 * The thrown `ZendeskApiError.message` is prefixed with `[CODE]` so the LLM can
 * parse the bracket and decide what to do — the SDK only serializes
 * `error.message` to the model, dropping custom fields.
 */

export type ZendeskIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface ZendeskIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedZendeskError {
  code: ZendeskIssueCode;
  action: ZendeskIssueAction;
  /** Literal upstream Zendesk message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Zendesk error body.
 *
 * Zendesk returns various shapes: `{ error: { title, message } }`,
 * `{ error: "<string>" }`, `{ description: "..." }`. Order matters.
 */
export function extractZendeskMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      error?: unknown;
      message?: unknown;
      description?: unknown;
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    // Zendesk sometimes nests { error: { title, message } }
    if (b.error && typeof b.error === 'object') {
      const nested = b.error as { message?: unknown; title?: unknown };
      const msg = pick(nested.message) ?? pick(nested.title);
      if (msg) return msg;
    }
    return pick(b.error as unknown) ?? pick(b.message) ?? pick(b.description) ?? fallback;
  }
  return fallback;
}

export function classifyZendeskError(
  status: number,
  body: unknown,
  fallbackMessage = 'Zendesk API error',
): ClassifiedZendeskError {
  const message = extractZendeskMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'Zendesk credentials are invalid. Check that EMAIL and API_TOKEN are correct in app settings.',
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
          'The API token lacks permission for this resource. Check your Zendesk role and permissions.',
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
        description: 'Zendesk rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Zendesk rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Zendesk API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Zendesk API error.' },
    message,
  };
}

/**
 * Thrown by `zendeskRequest` on non-OK responses (and on missing credentials).
 */
export class ZendeskApiError extends Error {
  readonly code: ZendeskIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: ZendeskIssueAction;

  constructor(
    code: ZendeskIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: ZendeskIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'ZendeskApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
