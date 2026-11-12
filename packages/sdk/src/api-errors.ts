/**
 * @agentapps/sdk — external API error classification helpers.
 *
 * Converts common HTTP and network errors into protocol-compatible
 * `HealthIssue` objects with a recommended severity and action.
 *
 * These helpers are intentionally transport-agnostic: they accept a status
 * code and/or message and return a plain `HealthIssue` that can be fed into
 * `HealthCheckBuilder.addIssue()` or returned directly from a health handler.
 */

import type { HealthIssue } from '@agentapps/protocol';

/** Classification metadata for an HTTP or network error. */
export interface ClassifiedApiError {
  /** Protocol-compatible issue. */
  issue: HealthIssue;
  /** Whether the caller should retry after a short delay. */
  retryable: boolean;
  /** Suggested backoff in milliseconds, when retryable. */
  retryAfterMs?: number;
}

/**
 * Classify a numeric HTTP status into a `HealthIssue`.
 *
 * @param status HTTP status code. `null` or `undefined` is treated as an
 *   unknown network error.
 * @param message Optional human-readable message; a default is generated
 *   when omitted.
 * @param provider Optional OAuth provider name to include in the action.
 * @param helpUrl Optional URL to show as a link action.
 */
export function classifyHttpError(
  status: number | null | undefined,
  message?: string,
  provider?: string,
  helpUrl?: string,
): ClassifiedApiError {
  switch (status) {
    case 401:
      return {
        issue: {
          code: 'api_unauthorized',
          message:
            message ??
            'The API rejected the request because the credentials are missing or invalid.',
          severity: 'error',
          action: provider
            ? { type: 'oauth', url: `/auth/${provider}`, label: `Reconnect ${provider}` }
            : helpUrl
              ? { type: 'link', url: helpUrl, label: 'Check credentials' }
              : undefined,
        },
        retryable: false,
      };

    case 403:
      return {
        issue: {
          code: 'api_forbidden',
          message: message ?? 'The API denied the request due to insufficient permissions.',
          severity: 'error',
          action: provider
            ? { type: 'oauth', url: `/auth/${provider}`, label: `Reconnect ${provider}` }
            : helpUrl
              ? { type: 'link', url: helpUrl, label: 'Review permissions' }
              : undefined,
        },
        retryable: false,
      };

    case 404:
      return {
        issue: {
          code: 'api_not_found',
          message: message ?? 'The requested API resource was not found.',
          severity: 'warning',
          action: helpUrl ? { type: 'link', url: helpUrl, label: 'View documentation' } : undefined,
        },
        retryable: false,
      };

    case 429:
      return {
        issue: {
          code: 'api_rate_limited',
          message: message ?? 'The API rate limit was exceeded.',
          severity: 'warning',
          action: helpUrl ? { type: 'link', url: helpUrl, label: 'View rate limits' } : undefined,
        },
        retryable: true,
        retryAfterMs: 60_000,
      };

    case 408:
      return {
        issue: {
          code: 'api_timeout',
          message: message ?? 'The API request timed out.',
          severity: 'warning',
          action: helpUrl ? { type: 'link', url: helpUrl, label: 'View status page' } : undefined,
        },
        retryable: true,
        retryAfterMs: 5_000,
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        issue: {
          code: 'api_server_error',
          message: message ?? `The API returned a server error (${status}).`,
          severity: 'warning',
          action: helpUrl ? { type: 'link', url: helpUrl, label: 'View status page' } : undefined,
        },
        retryable: true,
        retryAfterMs: 10_000,
      };

    default:
      if (status === null) {
        return {
          issue: {
            code: 'api_network_error',
            message: message ?? 'Could not reach the external API.',
            severity: 'error',
            action: helpUrl ? { type: 'link', url: helpUrl, label: 'View status page' } : undefined,
          },
          retryable: true,
          retryAfterMs: 5_000,
        };
      }

      if (status === undefined) {
        return {
          issue: {
            code: 'api_error',
            message:
              message ??
              'An unknown error occurred while calling the external API (no status code available).',
            severity: 'error',
            action: provider
              ? { type: 'oauth', url: `/auth/${provider}`, label: `Reconnect ${provider}` }
              : helpUrl
                ? { type: 'link', url: helpUrl, label: 'View documentation' }
                : undefined,
          },
          retryable: false,
        };
      }

      return {
        issue: {
          code: 'api_error',
          message: message ?? `The API returned an unexpected status (${status}).`,
          severity: status >= 400 ? 'error' : 'warning',
          action: helpUrl ? { type: 'link', url: helpUrl, label: 'View documentation' } : undefined,
        },
        retryable: status >= 500,
        retryAfterMs: status >= 500 ? 10_000 : undefined,
      };
  }
}

/**
 * Classify a caught Error into a `HealthIssue`.
 *
 * Detects common network/timeout keywords in the message and falls back to
 * `classifyHttpError` when a status is not available.
 */
export function classifyError(
  err: unknown,
  provider?: string,
  helpUrl?: string,
): ClassifiedApiError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('abort')) {
    return classifyHttpError(408, message, provider, helpUrl);
  }

  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return classifyHttpError(null, message, provider, helpUrl);
  }

  return classifyHttpError(undefined, message, provider, helpUrl);
}

/**
 * Extract a retry-after value (in milliseconds) from an HTTP header value.
 * Accepts both delta-seconds and HTTP-date strings.
 */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;

  const asSeconds = Number(value);
  if (!Number.isNaN(asSeconds)) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return undefined;
}
