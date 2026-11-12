/**
 * Todoist API error classification.
 *
 * Maps HTTP status + response body to (IssueCode + IssueAction). The `message`
 * carried by `TodoistApiError` is the LITERAL upstream Todoist message — never
 * re-tuned. Only the `action.description` (what the user/agent should do) is
 * curated per code.
 */

export type TodoistIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface TodoistIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedTodoistError {
  code: TodoistIssueCode;
  action: TodoistIssueAction;
  /** Literal upstream Todoist message. Never edited. */
  message: string;
}

/**
 * Pull the human message out of a Todoist error body.
 *
 * Todoist typically returns plain-text error messages or simple strings.
 */
export function extractTodoistMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (body && typeof body === 'object') {
    const b = body as { message?: unknown; error?: unknown };
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim().length > 0 ? v : undefined;
    return pick(b.message) ?? pick(b.error) ?? fallback;
  }
  return fallback;
}

export function classifyTodoistError(
  status: number,
  body: unknown,
  fallbackMessage = 'Todoist API error',
): ClassifiedTodoistError {
  const message = extractTodoistMessage(body, fallbackMessage);

  if (status === 401 || status === 403) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'user_action',
        description:
          'The Todoist API token is missing or invalid. Re-enter it from Todoist → Settings → Integrations → Developer → API token.',
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
        description: 'Todoist rate limit hit; retry after a short delay.',
      },
      message,
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'Todoist rejected the request — see the message.',
      },
      message,
    };
  }
  if (status >= 500) {
    return {
      code: 'PROVIDER_ERROR',
      action: { type: 'auto_retry', description: 'Todoist API temporarily unavailable.' },
      message,
    };
  }
  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected Todoist API error.' },
    message,
  };
}

/**
 * Thrown by `todoistRequest` on non-OK responses (and on a missing API token).
 * `message` is `[CODE] <upstream literal>`; `upstreamMessage` keeps the raw
 * provider text for tests and structured consumers.
 */
export class TodoistApiError extends Error {
  readonly code: TodoistIssueCode;
  readonly httpStatus: number;
  readonly upstreamMessage: string;
  readonly action: TodoistIssueAction;

  constructor(
    code: TodoistIssueCode,
    httpStatus: number,
    upstreamMessage: string,
    action: TodoistIssueAction,
  ) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'TodoistApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
