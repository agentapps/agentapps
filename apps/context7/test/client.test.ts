/**
 * Unit tests for the Context7 HTTP client — migrated from mca.context7.
 *
 * Stubs globalThis.fetch to verify header propagation, error classification,
 * and retry behaviour without hitting the real Context7 API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchContext7Json, fetchContext7Raw } from '../src/lib/client.js';
import {
  Context7AuthError,
  Context7Error,
  Context7NotFoundError,
  Context7RateLimitError,
} from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Fetch spy helpers
// ---------------------------------------------------------------------------

let calls: { url: string; init?: RequestInit }[];

function stubFetch(responder: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
      calls.push({ url, init });
      return responder(url, init);
    }),
  );
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// fetchContext7Raw
// ---------------------------------------------------------------------------

describe('fetchContext7Raw', () => {
  it('attaches Bearer header when apiKey present', async () => {
    stubFetch(
      () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await fetchContext7Raw('/v2/libs/search', {
      apiKey: 'ctx7sk-abc',
      searchParams: { libraryName: 'x' },
    });
    expect(calls[0].init?.headers).toBeDefined();
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer ctx7sk-abc');
  });

  it('omits Authorization header when no apiKey', async () => {
    stubFetch(() => new Response('{}', { status: 200 }));
    await fetchContext7Raw('/v2/libs/search', { searchParams: { libraryName: 'x' } });
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('throws Context7AuthError on 401', async () => {
    stubFetch(() => new Response('Unauthorized', { status: 401 }));
    await expect(fetchContext7Raw('/v2/libs/search')).rejects.toBeInstanceOf(Context7AuthError);
  });

  it('throws Context7NotFoundError on 404', async () => {
    stubFetch(() => new Response('Not Found', { status: 404 }));
    await expect(fetchContext7Raw('/v2/libs/search')).rejects.toBeInstanceOf(Context7NotFoundError);
  });

  it('throws Context7Error with status on other 4xx', async () => {
    stubFetch(() => new Response('Bad Request', { status: 400 }));
    await expect(fetchContext7Raw('/v2/libs/search')).rejects.toBeInstanceOf(Context7Error);
  });

  it('does not retry on 401 (auth fail is permanent)', async () => {
    stubFetch(() => new Response('Unauthorized', { status: 401 }));
    await fetchContext7Raw('/v2/libs/search').catch(() => {});
    expect(calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// fetchContext7Json
// ---------------------------------------------------------------------------

describe('fetchContext7Json', () => {
  it('parses JSON body', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ results: [{ id: '/x/y' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const out = await fetchContext7Json<{ results: { id: string }[] }>('/v2/libs/search');
    expect(out.results[0].id).toBe('/x/y');
  });

  it('throws on non-JSON body', async () => {
    stubFetch(
      () => new Response('plain text', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    await expect(fetchContext7Json('/v2/libs/search')).rejects.toBeInstanceOf(Context7Error);
  });
});

// ---------------------------------------------------------------------------
// Rate-limit retry
// ---------------------------------------------------------------------------

describe('Context7RateLimitError', () => {
  it('thrown on 429 (after retries)', async () => {
    let callCount = 0;
    stubFetch(() => {
      callCount++;
      return new Response('rate limited', { status: 429 });
    });
    await expect(fetchContext7Raw('/v2/libs/search')).rejects.toBeInstanceOf(
      Context7RateLimitError,
    );
    // The client retries 429 (shouldRetry returns true for rate limit),
    // so we expect more than 1 call.
    expect(callCount).toBeGreaterThan(1);
  });
});
