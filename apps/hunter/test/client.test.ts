/**
 * Unit tests for Hunter API client helpers and error classification.
 *
 * These test the pure functions in `src/lib/_hunter-error.ts` (error
 * classification and message extraction) which are exported and testable
 * without the runtime harness.
 *
 * Migrated from mca.hunter/test/unit/client.test.ts (bun:test -> vitest).
 */

import { describe, expect, it } from 'vitest';
import {
  classifyHunterError,
  extractHunterMessage,
  HunterApiError,
} from '../src/lib/_hunter-error.js';

// ---------------------------------------------------------------------------
// extractHunterMessage
// ---------------------------------------------------------------------------

describe('extractHunterMessage', () => {
  it('reads details + id from the Hunter error envelope', () => {
    const body = JSON.stringify({
      errors: [{ id: 'usage_limit_reached', code: 429, details: 'Too much' }],
    });
    expect(extractHunterMessage(body, 429)).toEqual({
      id: 'usage_limit_reached',
      message: 'Too much',
    });
  });

  it('falls back to truncated raw body when not JSON', () => {
    expect(extractHunterMessage('boom', 500)).toEqual({ message: 'boom' });
  });

  it('falls back to a status message when body is empty', () => {
    expect(extractHunterMessage('', 502)).toEqual({
      message: 'Hunter API returned HTTP 502',
    });
  });
});

// ---------------------------------------------------------------------------
// classifyHunterError
// ---------------------------------------------------------------------------

describe('classifyHunterError', () => {
  const body = (id: string, details: string) => JSON.stringify({ errors: [{ id, details }] });

  it('401 -> AUTH_INVALID with preserved upstream message', () => {
    const classified = classifyHunterError(401, body('wrong_auth', 'Invalid API key'));
    expect(classified.code).toBe('AUTH_INVALID');
    expect(classified.message).toBe('Invalid API key');
  });

  it('403 -> RATE_LIMITED (Hunter uses 403 for rate limiting)', () => {
    const classified = classifyHunterError(403, body('rate_limit', 'Too fast'));
    expect(classified.code).toBe('RATE_LIMITED');
  });

  it('429 -> QUOTA_EXCEEDED directly, even without usage keyword', () => {
    const classified = classifyHunterError(429, body('too_many_requests', 'Slow down'));
    expect(classified.code).toBe('QUOTA_EXCEEDED');
  });

  it('429 usage_limit_reached -> QUOTA_EXCEEDED', () => {
    expect(classifyHunterError(429, body('usage_limit_reached', 'Monthly limit')).code).toBe(
      'QUOTA_EXCEEDED',
    );
  });

  it('400 and 422 -> BAD_REQUEST', () => {
    expect(classifyHunterError(400, body('bad', 'nope')).code).toBe('BAD_REQUEST');
    expect(classifyHunterError(422, body('bad', 'nope')).code).toBe('BAD_REQUEST');
  });

  it('404 -> NOT_FOUND', () => {
    expect(classifyHunterError(404, body('nf', 'gone')).code).toBe('NOT_FOUND');
  });

  it('500 -> PROVIDER_ERROR', () => {
    expect(classifyHunterError(500, body('srv', 'kaboom')).code).toBe('PROVIDER_ERROR');
  });
});

// ---------------------------------------------------------------------------
// HunterApiError
// ---------------------------------------------------------------------------

describe('HunterApiError', () => {
  it('formats message as [CODE] upstream', () => {
    const err = new HunterApiError('AUTH_INVALID', 401, 'Invalid key', {
      type: 'user_action',
      description: 'Re-enter key',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HunterApiError);
    expect(err.code).toBe('AUTH_INVALID');
    expect(err.httpStatus).toBe(401);
    expect(err.upstreamMessage).toBe('Invalid key');
    expect(err.message).toBe('[AUTH_INVALID] Invalid key');
    expect(err.action).toEqual({ type: 'user_action', description: 'Re-enter key' });
  });

  it('includes code and httpStatus fields', () => {
    const err = new HunterApiError('QUOTA_EXCEEDED', 429, 'Out of credits', {
      type: 'user_action',
      description: 'Upgrade plan',
    });
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.httpStatus).toBe(429);
  });
});
