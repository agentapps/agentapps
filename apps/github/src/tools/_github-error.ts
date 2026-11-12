import { GitHubAppNotInstalledError } from '../lib/github-app-token.js';
import { GitHubApiError } from '../lib/github-client.js';
import { GitHubUserNotAuthenticatedError } from '../lib/github-user-token.js';

export type GitHubIssueCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'USER_NOT_AUTHENTICATED'
  | 'APP_NOT_INSTALLED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'SECONDARY_RATE_LIMIT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'UNPROCESSABLE'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface GitHubIssueAction {
  type: 'user_action' | 'system_action';
  description: string;
  url?: string;
}

export interface ClassifiedGitHubError {
  code: GitHubIssueCode;
  message: string;
  action: GitHubIssueAction;
  status?: number;
  documentationUrl?: string;
  rateLimitReset?: number;
}

const RECONNECT_URL = 'https://github.com/apps/agentapps/installations/new';

export function classifyGitHubError(error: unknown): ClassifiedGitHubError {
  if (error instanceof GitHubUserNotAuthenticatedError) {
    return {
      code: 'USER_NOT_AUTHENTICATED',
      message: error.message,
      action: {
        type: 'user_action',
        description: 'Reconnect your GitHub account so actions are signed with your identity.',
        url: error.installUrl,
      },
    };
  }

  if (error instanceof GitHubAppNotInstalledError) {
    return {
      code: 'APP_NOT_INSTALLED',
      message: error.message,
      action: {
        type: 'user_action',
        description: 'Install the GitHub App on the repositories you want the agent to access.',
        url: error.installUrl,
      },
    };
  }

  if (error instanceof GitHubApiError) {
    return classifyApiError(error);
  }

  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return {
      code: 'NETWORK_ERROR',
      message: error.message,
      action: {
        type: 'user_action',
        description: 'Could not reach the GitHub API. Check your network connection and retry.',
      },
    };
  }

  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Unexpected error talking to GitHub',
    action: {
      type: 'user_action',
      description: 'Retry the operation. If the problem persists, contact support.',
    },
  };
}

function classifyApiError(error: GitHubApiError): ClassifiedGitHubError {
  const literal = error.message;
  const lower = literal.toLowerCase();
  const reset = error.rateLimitReset ?? undefined;
  const docUrl = error.documentationUrl ?? undefined;
  const errors = (typeof error.body === 'object' && error.body?.errors) || [];

  switch (error.status) {
    case 401:
      return {
        code: 'AUTH_EXPIRED',
        message: literal,
        action: {
          type: 'user_action',
          description: 'Your GitHub session expired. Reconnect your GitHub account.',
          url: RECONNECT_URL,
        },
        status: error.status,
        documentationUrl: docUrl,
      };

    case 403: {
      if (/suspended|installation.*not.*authorized/i.test(lower)) {
        return {
          code: 'APP_NOT_INSTALLED',
          message: literal,
          action: {
            type: 'user_action',
            description:
              'The GitHub App installation was suspended or removed. Reinstall it to continue.',
            url: RECONNECT_URL,
          },
          status: error.status,
          documentationUrl: docUrl,
        };
      }
      if (/resource not accessible by integration|missing.*permission/i.test(lower)) {
        return {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: literal,
          action: {
            type: 'user_action',
            description:
              'The GitHub App is missing a required permission for this action. Review the App permissions in your GitHub installation settings.',
            url: RECONNECT_URL,
          },
          status: error.status,
          documentationUrl: docUrl,
        };
      }
      if (error.rateLimitRemaining === 0 || /rate limit|api rate/i.test(lower)) {
        return {
          code: 'RATE_LIMITED',
          message: literal,
          action: {
            type: 'user_action',
            description: reset
              ? `GitHub primary rate limit reached. Retry after ${new Date(reset * 1000).toISOString()}.`
              : 'GitHub primary rate limit reached. Retry in a few minutes.',
          },
          status: error.status,
          documentationUrl: docUrl,
          rateLimitReset: reset,
        };
      }
      if (/abuse|secondary rate/i.test(lower)) {
        return {
          code: 'SECONDARY_RATE_LIMIT',
          message: literal,
          action: {
            type: 'user_action',
            description:
              'GitHub secondary rate limit triggered. Wait at least 60 seconds and retry.',
          },
          status: error.status,
          documentationUrl: docUrl,
        };
      }
      return {
        code: 'PERMISSION_DENIED',
        message: literal,
        action: {
          type: 'user_action',
          description: /scope|oauth|sso/i.test(lower)
            ? 'Your GitHub OAuth grant is missing a required scope. Reconnect your account to refresh permissions.'
            : 'You do not have permission for this resource. Verify repository access or organization SSO.',
          url: RECONNECT_URL,
        },
        status: error.status,
        documentationUrl: docUrl,
      };
    }

    case 404:
      return {
        code: 'NOT_FOUND',
        message: literal,
        action: {
          type: 'user_action',
          description: 'The requested resource was not found. Check the owner, repo, or id.',
        },
        status: error.status,
        documentationUrl: docUrl,
      };

    case 409:
      return {
        code: 'CONFLICT',
        message: literal,
        action: {
          type: 'user_action',
          description:
            'GitHub reports a conflict with the current state (merge conflict, branch out of sync, etc.).',
        },
        status: error.status,
        documentationUrl: docUrl,
      };

    case 422: {
      const detail = errors
        .map((e) => `${e.resource ?? '?'}.${e.field ?? '?'}: ${e.code ?? e.message ?? 'invalid'}`)
        .join('; ');
      return {
        code: 'VALIDATION',
        message: literal,
        action: {
          type: 'user_action',
          description: detail
            ? `Validation failed: ${detail}.`
            : 'GitHub rejected the input. Review the request body and retry.',
        },
        status: error.status,
        documentationUrl: docUrl,
      };
    }

    default:
      if (error.status >= 500) {
        return {
          code: 'SERVER_ERROR',
          message: literal,
          action: {
            type: 'user_action',
            description: 'GitHub returned a server error. Check status.github.com and retry.',
            url: 'https://www.githubstatus.com/',
          },
          status: error.status,
          documentationUrl: docUrl,
        };
      }
      if (/not connected|not authorized/i.test(lower)) {
        return {
          code: 'AUTH_REQUIRED',
          message: literal,
          action: {
            type: 'user_action',
            description: 'Connect your GitHub account to continue.',
            url: RECONNECT_URL,
          },
          status: error.status,
          documentationUrl: docUrl,
        };
      }
      return {
        code: 'UNKNOWN',
        message: literal,
        action: {
          type: 'user_action',
          description: 'Unexpected GitHub response. Retry; if it persists, contact support.',
        },
        status: error.status,
        documentationUrl: docUrl,
      };
  }
}
