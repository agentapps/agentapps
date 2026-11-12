/**
 * Unit tests for TtlCache — migrated from mca.context7.
 *
 * Pure helper tests: direct import, no runtime harness needed.
 */

import { describe, expect, it } from 'vitest';
import { TtlCache } from '../src/lib/cache.js';

describe('TtlCache', () => {
  it('returns undefined for missing key', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('foo')).toBeUndefined();
  });

  it('returns value when key exists', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('foo', 'bar');
    expect(cache.get('foo')).toBe('bar');
  });

  it('expires entries after ttl', async () => {
    const cache = new TtlCache<number>(50);
    cache.set('k', 1);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get('k')).toBeUndefined();
  });

  it('evicts oldest when reaching maxSize', () => {
    const cache = new TtlCache<number>(60_000, 3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('updating existing key does not evict', () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 99);
    expect(cache.get('a')).toBe(99);
    expect(cache.get('b')).toBe(2);
  });

  it('clear empties cache', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('x', 'y');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
