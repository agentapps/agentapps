/**
 * Trello API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `TrelloApiError` is the LITERAL upstream Trello message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 */

export type TrelloIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface TrelloIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedTrelloError {
  code: TrelloIssueCode;
  action: TrelloIssueAction;
  message: string;
}

export function extractTrelloMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? pick(b.error) ?? fallback;
  }
  return fallback;
}

export function classifyTrelloError(
  status: number,
  body: unknown,
  fallbackMessage = 'Trello API error',
): ClassifiedTrelloError {
  const message = extractTrelloMessage(body, fallbackMessage);

  if (status === 401) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Trello API key or token is missing or invalid. Re-check your credentials in the app settings.',
      },
      message,
    };
  }
  if (status === 403) {
    return {
      code: 'PERMISSION_DENIED',
      action: {
        type: 'user_action',
        description: 'The API key/token lacks permission for this resource.',
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
        description: 'Trello rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Trello rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Trello API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Trello API error.' },
    message,
  };
}

export class TrelloApiError extends Error {
  readonly code: TrelloIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: TrelloIssueAction;

  constructor(
    code: TrelloIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: TrelloIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'TrelloApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
