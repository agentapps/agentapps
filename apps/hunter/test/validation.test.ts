/**
 * Unit tests for Hunter validation helpers.
 *
 * These are pure functions exported from `src/lib/validation.ts` — no runtime
 * harness needed, just direct imports.
 *
 * Migrated from mca.hunter/test/unit/validation.test.ts (bun:test -> vitest).
 */

import { describe, expect, it } from 'vitest';
import {
  optionalInt,
  requireDomain,
  requireEmail,
  requireNonEmpty,
} from '../src/lib/validation.js';

// ---------------------------------------------------------------------------
// requireDomain
// ---------------------------------------------------------------------------

describe('requireDomain', () => {
  it('accepts a bare company domain', () => {
    expect(requireDomain('stripe.com')).toBe('stripe.com');
  });

  it('strips scheme + path and lowercases', () => {
    expect(requireDomain('HTTPS://Stripe.com/pricing')).toBe('stripe.com');
  });

  it('accepts multi-label domains', () => {
    expect(requireDomain('mail.google.co.uk')).toBe('mail.google.co.uk');
  });

  it('rejects a bare IPv4 address (no alphabetic TLD)', () => {
    expect(() => requireDomain('192.168.0.1')).toThrow(/\[BAD_REQUEST\]/);
  });

  it('rejects a numeric TLD', () => {
    expect(() => requireDomain('foo.123')).toThrow(/\[BAD_REQUEST\]/);
  });

  it('rejects empty / whitespace', () => {
    expect(() => requireDomain('   ')).toThrow(/\[BAD_REQUEST\].*domain/);
  });
});

// ---------------------------------------------------------------------------
// optionalInt
// ---------------------------------------------------------------------------

describe('optionalInt boundaries', () => {
  it('undefined / null -> undefined (absent)', () => {
    expect(optionalInt(undefined, 'limit', 1, 100)).toBeUndefined();
    expect(optionalInt(null, 'limit', 1, 100)).toBeUndefined();
  });

  it('accepts the inclusive min and max', () => {
    expect(optionalInt(1, 'limit', 1, 100)).toBe(1);
    expect(optionalInt(100, 'limit', 1, 100)).toBe(100);
  });

  it('accepts 0 when min is 0 (offset)', () => {
    expect(optionalInt(0, 'offset', 0, 100_000)).toBe(0);
  });

  it('rejects 0 when min is 1', () => {
    expect(() => optionalInt(0, 'limit', 1, 100)).toThrow(/limit must be an integer in \[1, 100\]/);
  });

  it('rejects a negative value', () => {
    expect(() => optionalInt(-1, 'limit', 1, 100)).toThrow(/\[BAD_REQUEST\]/);
  });

  it('rejects a non-integer', () => {
    expect(() => optionalInt(1.5, 'limit', 1, 100)).toThrow(/\[BAD_REQUEST\]/);
  });

  it('rejects above max', () => {
    expect(() => optionalInt(101, 'limit', 1, 100)).toThrow(/\[BAD_REQUEST\]/);
  });
});

// ---------------------------------------------------------------------------
// requireEmail / requireNonEmpty
// ---------------------------------------------------------------------------

describe('requireEmail / requireNonEmpty', () => {
  it('accepts a valid email, rejects garbage', () => {
    expect(requireEmail('a@b.com')).toBe('a@b.com');
    expect(() => requireEmail('nope')).toThrow(/\[BAD_REQUEST\].*email/);
  });

  it('requireNonEmpty trims and rejects whitespace', () => {
    expect(requireNonEmpty('  x  ', 'f')).toBe('x');
    expect(() => requireNonEmpty('   ', 'f')).toThrow(/f is required/);
  });
});
