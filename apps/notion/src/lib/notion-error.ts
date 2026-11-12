/**
 * Notion API error classification.
 *
 * Maps the SDK's NotionClientError taxonomy to a stable IssueCode + IssueAction.
 * The upstream message is preserved verbatim — only the action description is
 * curated per code.
 */

import { APIErrorCode, ClientErrorCode, isNotionClientError } from '@notionhq/client';

export type IssueCode =
  | 'AUTH_EXPIRED'
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'SYSTEM_CONFIG_MISSING';

export interface IssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedNotionError {
  code: IssueCode;
  action: IssueAction;
  message: string;
}

const ACTION_BY_CODE: Record<IssueCode, IssueAction> = {
  AUTH_EXPIRED: {
    type: 'user_action',
    description: 'Reconnect your Notion account — the access token expired or was revoked.',
  },
  AUTH_REQUIRED: {
    type: 'user_action',
    description: 'Connect your Notion account via OAuth.',
  },
  PERMISSION_DENIED: {
    type: 'user_action',
    description:
      'Share the target page or database with the integration in Notion (Page → Connections → Add).',
  },
  NOT_FOUND: {
    type: 'user_action',
    description: 'Resource not found — verify the UUID or whether it was archived/deleted.',
  },
  RATE_LIMITED: {
    type: 'auto_retry',
    description: 'Notion rate limit; retry after a short delay.',
  },
  VALIDATION_ERROR: {
    type: 'user_action',
    description: 'Request rejected by Notion — see message for the offending field.',
  },
  CONFLICT: {
    type: 'auto_retry',
    description: 'Concurrent update on the same Notion resource — retry.',
  },
  PROVIDER_ERROR: {
    type: 'auto_retry',
    description: 'Notion API temporarily unavailable.',
  },
  NETWORK_ERROR: {
    type: 'auto_retry',
    description: 'Network error reaching Notion.',
  },
  SYSTEM_CONFIG_MISSING: {
    type: 'admin_action',
    description: 'Configure Notion CLIENT_ID and CLIENT_SECRET in system secrets.',
  },
};

function build(code: IssueCode, message: string): ClassifiedNotionError {
  return { code, action: ACTION_BY_CODE[code], message };
}

function mapSdkCodeToIssue(code: APIErrorCode | ClientErrorCode): IssueCode {
  switch (code) {
    case APIErrorCode.Unauthorized:
      return 'AUTH_EXPIRED';
    case APIErrorCode.RestrictedResource:
      return 'PERMISSION_DENIED';
    case APIErrorCode.ObjectNotFound:
      return 'NOT_FOUND';
    case APIErrorCode.RateLimited:
      return 'RATE_LIMITED';
    case APIErrorCode.InvalidJSON:
    case APIErrorCode.InvalidRequestURL:
    case APIErrorCode.InvalidRequest:
    case APIErrorCode.ValidationError:
      return 'VALIDATION_ERROR';
    case APIErrorCode.ConflictError:
      return 'CONFLICT';
    case APIErrorCode.InternalServerError:
    case APIErrorCode.ServiceUnavailable:
    case APIErrorCode.GatewayTimeout:
      return 'PROVIDER_ERROR';
    case ClientErrorCode.RequestTimeout:
    case ClientErrorCode.ResponseError:
      return 'NETWORK_ERROR';
    case ClientErrorCode.InvalidPathParameter:
      return 'VALIDATION_ERROR';
    default:
      return 'PROVIDER_ERROR';
  }
}

const NETWORK_MESSAGE_RE = /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|fetch failed/i;

/**
 * Classify an error caught from a Notion SDK call into a stable IssueCode +
 * IssueAction. Leaves the original upstream message intact.
 */
export function classifyNotionError(err: unknown): ClassifiedNotionError {
  if (err instanceof NotionApiError) return err.classified;

  if (isNotionClientError(err)) {
    return build(mapSdkCodeToIssue(err.code), err.message);
  }

  const message = err instanceof Error ? err.message : String(err);
  if (NETWORK_MESSAGE_RE.test(message)) {
    return build('NETWORK_ERROR', message);
  }
  return build('PROVIDER_ERROR', message);
}

/**
 * Thrown on classified Notion errors. Prepends [CODE] to the message for
 * agent routing.
 */
export class NotionApiError extends Error {
  classified: ClassifiedNotionError;
  upstreamMessage: string;

  constructor(classified: ClassifiedNotionError) {
    super(`[${classified.code}] ${classified.message}`);
    this.name = 'NotionApiError';
    this.classified = classified;
    this.upstreamMessage = classified.message;
  }
}
