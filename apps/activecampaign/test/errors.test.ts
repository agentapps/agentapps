import { describe, expect, it } from 'vitest';
import {
  ActiveCampaignAuthError,
  ActiveCampaignBadRequestError,
  ActiveCampaignError,
  ActiveCampaignNotFoundError,
  ActiveCampaignRateLimitError,
  classifyAcError,
  extractAcErrorMessage,
} from '../src/lib/errors.js';

describe('classifyAcError', () => {
  it('401/403 -> AuthError', () => {
    expect(classifyAcError(401, { errors: [{ title: 'no auth' }] })).toBeInstanceOf(
      ActiveCampaignAuthError,
    );
    expect(classifyAcError(403, {})).toBeInstanceOf(ActiveCampaignAuthError);
  });

  it('404 -> NotFoundError', () => {
    expect(classifyAcError(404, { message: 'gone' })).toBeInstanceOf(ActiveCampaignNotFoundError);
  });

  it('429 -> RateLimitError', () => {
    expect(classifyAcError(429, {})).toBeInstanceOf(ActiveCampaignRateLimitError);
  });

  it('400 -> BadRequest', () => {
    expect(classifyAcError(400, { errors: [{ title: 'invalid email' }] })).toBeInstanceOf(
      ActiveCampaignBadRequestError,
    );
  });

  it('500 -> generic API error (not 4xx variants)', () => {
    const err = classifyAcError(500, { errors: [{ title: 'boom' }] });
    expect(err).toBeInstanceOf(ActiveCampaignError);
    expect(err).not.toBeInstanceOf(ActiveCampaignBadRequestError);
    expect(err.code).toBe('API_ERROR');
    expect(err.status).toBe(500);
  });

  it('preserves upstream message in error.message via [CODE] prefix', () => {
    const err = classifyAcError(400, { errors: [{ title: 'invalid email' }] });
    expect(err.message).toBe('[BAD_REQUEST] invalid email');
    expect(err.upstreamMessage).toBe('invalid email');
  });
});

describe('extractAcErrorMessage', () => {
  it('reads errors[0].title', () => {
    expect(extractAcErrorMessage({ errors: [{ title: 'oops' }] }, 'fallback')).toBe('oops');
  });

  it('falls back to errors[0].message when title absent', () => {
    expect(extractAcErrorMessage({ errors: [{ message: 'msg' }] }, 'fb')).toBe('msg');
  });

  it('reads top-level message/error', () => {
    expect(extractAcErrorMessage({ message: 'm' }, 'fb')).toBe('m');
    expect(extractAcErrorMessage({ error: 'e' }, 'fb')).toBe('e');
  });

  it('uses fallback when nothing recognizable', () => {
    expect(extractAcErrorMessage({}, 'fallback')).toBe('fallback');
    expect(extractAcErrorMessage(null, 'fallback')).toBe('fallback');
  });
});
