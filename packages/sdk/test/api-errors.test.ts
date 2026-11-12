/**
 * Tests for @agentapps/sdk external API error classification helpers.
 *
 * Validates mapping of HTTP status codes and network errors to protocol
 * compatible HealthIssue objects with retry hints.
 */

import { describe, expect, it } from 'vitest';
import { classifyError, classifyHttpError, parseRetryAfter } from '../src/api-errors.js';

describe('classifyHttpError', () => {
  it('classifies 401 as unauthorized with oauth action', () => {
    const { issue, retryable } = classifyHttpError(401, 'Invalid token', 'google');
    expect(issue.code).toBe('api_unauthorized');
    expect(issue.severity).toBe('error');
    expect(issue.action).toEqual({ type: 'oauth', url: '/auth/google', label: 'Reconnect google' });
    expect(retryable).toBe(false);
  });

  it('classifies 403 as forbidden', () => {
    const { issue, retryable } = classifyHttpError(403, 'Forbidden', 'google');
    expect(issue.code).toBe('api_forbidden');
    expect(issue.severity).toBe('error');
    expect(issue.action?.type).toBe('oauth');
    expect(retryable).toBe(false);
  });

  it('classifies 404 as warning', () => {
    const { issue, retryable } = classifyHttpError(
      404,
      'Not found',
      undefined,
      'https://docs.example.com',
    );
    expect(issue.code).toBe('api_not_found');
    expect(issue.severity).toBe('warning');
    expect(issue.action?.type).toBe('link');
    expect(retryable).toBe(false);
  });

  it('classifies 429 as rate limited and retryable', () => {
    const { issue, retryable, retryAfterMs } = classifyHttpError(429);
    expect(issue.code).toBe('api_rate_limited');
    expect(issue.severity).toBe('warning');
    expect(retryable).toBe(true);
    expect(retryAfterMs).toBe(60_000);
  });

  it('classifies 408 as timeout and retryable', () => {
    const { issue, retryable, retryAfterMs } = classifyHttpError(408);
    expect(issue.code).toBe('api_timeout');
    expect(issue.severity).toBe('warning');
    expect(retryable).toBe(true);
    expect(retryAfterMs).toBe(5_000);
  });

  it.each([500, 502, 503, 504])('classifies %i as server error and retryable', (status) => {
    const { issue, retryable, retryAfterMs } = classifyHttpError(status);
    expect(issue.code).toBe('api_server_error');
    expect(issue.severity).toBe('warning');
    expect(retryable).toBe(true);
    expect(retryAfterMs).toBe(10_000);
  });

  it('classifies null status as network error', () => {
    const { issue, retryable } = classifyHttpError(null);
    expect(issue.code).toBe('api_network_error');
    expect(issue.severity).toBe('error');
    expect(retryable).toBe(true);
  });

  it('classifies unknown 4xx as error', () => {
    const { issue, retryable } = classifyHttpError(418);
    expect(issue.code).toBe('api_error');
    expect(issue.severity).toBe('error');
    expect(retryable).toBe(false);
  });

  it('falls back to a link action when no provider is given', () => {
    const { issue } = classifyHttpError(
      401,
      'Invalid token',
      undefined,
      'https://docs.example.com',
    );
    expect(issue.action).toEqual({
      type: 'link',
      url: 'https://docs.example.com',
      label: 'Check credentials',
    });
  });
});

describe('classifyError', () => {
  it('detects timeout from error message', () => {
    const { issue } = classifyError(new Error('Request timeout'));
    expect(issue.code).toBe('api_timeout');
  });

  it('detects network errors from error message', () => {
    const { issue } = classifyError(new Error('connect ECONNREFUSED'));
    expect(issue.code).toBe('api_network_error');
  });

  it('detects fetch failures as network errors', () => {
    const { issue } = classifyError(new Error('fetch failed'));
    expect(issue.code).toBe('api_network_error');
  });

  it('falls back to generic error for unknown errors', () => {
    const { issue } = classifyError(new Error('something went wrong'));
    expect(issue.code).toBe('api_error');
    expect(issue.message).toBe('something went wrong');
  });

  it('passes provider through to the generated action', () => {
    const { issue } = classifyError(new Error('Unauthorized'), 'google');
    expect(issue.action?.type).toBe('oauth');
  });
});

describe('parseRetryAfter', () => {
  it('parses delta seconds', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
  });

  it('parses an HTTP date', () => {
    const future = new Date(Date.now() + 30_000).toUTCString();
    const parsed = parseRetryAfter(future);
    expect(parsed).toBeGreaterThan(0);
    expect(parsed).toBeLessThanOrEqual(30_000);
  });

  it('returns undefined for empty values', () => {
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid strings', () => {
    expect(parseRetryAfter('not-a-date')).toBeUndefined();
  });
});
