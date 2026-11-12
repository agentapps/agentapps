/**
 * MinIO error classification.
 *
 * Maps MinIO SDK errors to (IssueCode + IssueAction). The thrown
 * `MinioApiError.message` is prefixed with `[CODE]` so the LLM can parse the
 * bracket and decide what to do.
 */

export type MinioIssueCode =
  | 'AUTH_INVALID'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'PROVIDER_ERROR';

export interface MinioIssueAction {
  type: 'user_action' | 'admin_action' | 'auto_retry';
  description: string;
}

export interface ClassifiedMinioError {
  code: MinioIssueCode;
  action: MinioIssueAction;
  message: string;
}

/**
 * Classify a MinIO SDK error into a structured error with code + action.
 */
export function classifyMinioError(error: unknown): ClassifiedMinioError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown MinIO error';

  const messageLower = message.toLowerCase();

  if (
    messageLower.includes('access denied') ||
    messageLower.includes('accessdenied') ||
    messageLower.includes('invalid access key') ||
    messageLower.includes('invalidaccesskeyid')
  ) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'admin_action',
        description:
          'MinIO credentials are invalid. Re-enter ENDPOINT, ACCESS_KEY, and SECRET_KEY in system secrets.',
      },
      message,
    };
  }

  if (messageLower.includes('signature') || messageLower.includes('signaturedoesnotmatch')) {
    return {
      code: 'AUTH_INVALID',
      action: {
        type: 'admin_action',
        description: 'MinIO secret key is incorrect. Update SECRET_KEY in system secrets.',
      },
      message,
    };
  }

  if (messageLower.includes('no such bucket') || messageLower.includes('nosuchbucket')) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'The specified bucket does not exist. Check the bucket name and try again.',
      },
      message,
    };
  }

  if (messageLower.includes('no such key') || messageLower.includes('nosuchkey')) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'The specified object does not exist. Check the object name and try again.',
      },
      message,
    };
  }

  if (messageLower.includes('not found') || messageLower.includes('404')) {
    return {
      code: 'NOT_FOUND',
      action: {
        type: 'user_action',
        description: 'Resource not found. Check the bucket/object name.',
      },
      message,
    };
  }

  if (
    messageLower.includes('bucket not empty') ||
    messageLower.includes('bucketnotempty') ||
    messageLower.includes('invalid bucket name') ||
    messageLower.includes('invalidbucketname')
  ) {
    return {
      code: 'BAD_REQUEST',
      action: {
        type: 'user_action',
        description: 'MinIO rejected the request. See the error message for details.',
      },
      message,
    };
  }

  if (messageLower.includes('econnrefused') || messageLower.includes('enotfound')) {
    return {
      code: 'PROVIDER_ERROR',
      action: {
        type: 'admin_action',
        description:
          'Cannot reach the MinIO server. Check that ENDPOINT is correct and the server is running.',
      },
      message,
    };
  }

  return {
    code: 'PROVIDER_ERROR',
    action: { type: 'auto_retry', description: 'Unexpected MinIO error.' },
    message,
  };
}

/**
 * Thrown by MinIO tool handlers on errors.
 */
export class MinioApiError extends Error {
  readonly code: MinioIssueCode;
  readonly upstreamMessage: string;
  readonly action: MinioIssueAction;

  constructor(code: MinioIssueCode, upstreamMessage: string, action: MinioIssueAction) {
    super(`[${code}] ${upstreamMessage}`);
    this.name = 'MinioApiError';
    this.code = code;
    this.upstreamMessage = upstreamMessage;
    this.action = action;
  }
}
