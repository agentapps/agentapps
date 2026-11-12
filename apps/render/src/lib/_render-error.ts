/**
 * Render API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `RenderApiError` is the LITERAL upstream Render message -- never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 *
 * The thrown `RenderApiError.message` is prefixed with `[CODE]` so the LLM can
 * parse the bracket and decide what to do.
 */

export type RenderIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface RenderIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedRenderError {
  code: RenderIssueCode;
  action: RenderIssueAction;
  /** Literal upstream Render message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Render error body.
 */
export function extractRenderMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as {
      message?: unknown;
      error?: unknown;
      id?: unknown;
    };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? pick(b.error) ?? pick(b.id) ?? fallback;
  }
  return fallback;
}

export function classifyRenderError(
  status: number,
  body: unknown,
  fallbackMessage = 'Render API error',
): ClassifiedRenderError {
  const message = extractRenderMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Render API key is missing or invalid. Re-enter it from https://dashboard.render.com/u/settings#api-keys.',
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
        description: 'Render rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Render rejected the request -- see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Render API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Render API error.' },
    message,
  };
}

/**
 * Thrown by `renderRequest` on non-OK responses (and on a missing API key).
 */
export class RenderApiError extends Error {
  readonly code: RenderIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: RenderIssueAction;

  constructor(
    code: RenderIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: RenderIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'RenderApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
