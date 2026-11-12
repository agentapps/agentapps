/**
 * Unit tests for pure, side-effect-free helpers in the Google Analytics app.
 *
 * Migrated from the old MCA test suite (bun:test) to vitest.
 * These import the helpers directly -- no runtime harness needed.
 *
 * Covers: parsers, pick, mapAnalyticsError, curateReport, buildReportRequest,
 *         classifyAccountsProbe.
 */

import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  buildReportRequest,
  classifyAccountsProbe,
  curateReport,
  mapAnalyticsError,
  parseAccountName,
  parsePropertyName,
  parseStreamId,
  pick,
  propertyIdOf,
} from '../src/lib/helpers.js';

// ---------------------------------------------------------------------------
// parsePropertyName
// ---------------------------------------------------------------------------

describe('parsePropertyName', () => {
  it('wraps a bare numeric id', () => {
    expect(parsePropertyName('123456')).toBe('properties/123456');
  });

  it('passes through an already-qualified name (idempotent)', () => {
    expect(parsePropertyName('properties/123456')).toBe('properties/123456');
  });

  it('trims surrounding whitespace before wrapping', () => {
    expect(parsePropertyName('  789  ')).toBe('properties/789');
  });

  it('RE-VALIDATES the prefixed branch: a non-numeric tail is rejected', () => {
    expect(() => parsePropertyName('properties/abc')).toThrow(/INVALID_ARGUMENT/);
  });

  it('RE-VALIDATES the prefixed branch: a deeper resource path is rejected', () => {
    expect(() => parsePropertyName('properties/123/dataStreams/9')).toThrow(/numeric ID/);
  });

  it('coerces a numeric (non-string) input via String() before wrapping', () => {
    expect(parsePropertyName(123456 as unknown as string)).toBe('properties/123456');
  });

  it('rejects an empty string', () => {
    expect(() => parsePropertyName('')).toThrow(/propertyId must be a non-empty string/);
  });

  it('rejects a whitespace-only string', () => {
    expect(() => parsePropertyName('   ')).toThrow(/non-empty string/);
  });

  it('rejects a non-numeric unqualified id', () => {
    expect(() => parsePropertyName('abc')).toThrow(/must be a numeric ID/);
  });

  it('rejects a numeric id with trailing characters', () => {
    expect(() => parsePropertyName('123abc')).toThrow(/INVALID_ARGUMENT/);
  });

  it('rejects an accounts/-qualified name (wrong resource type)', () => {
    expect(() => parsePropertyName('accounts/123')).toThrow(/must be a numeric ID/);
  });
});

// ---------------------------------------------------------------------------
// parseAccountName
// ---------------------------------------------------------------------------

describe('parseAccountName', () => {
  it('wraps a bare numeric id', () => {
    expect(parseAccountName('789')).toBe('accounts/789');
  });

  it('passes through an already-qualified name (idempotent)', () => {
    expect(parseAccountName('accounts/789')).toBe('accounts/789');
  });

  it('trims surrounding whitespace before wrapping', () => {
    expect(parseAccountName('  42  ')).toBe('accounts/42');
  });

  it('RE-VALIDATES the prefixed branch: a non-numeric tail is rejected', () => {
    expect(() => parseAccountName('accounts/xyz')).toThrow(/INVALID_ARGUMENT/);
  });

  it('coerces a numeric (non-string) input via String() before wrapping', () => {
    expect(parseAccountName(42 as unknown as string)).toBe('accounts/42');
  });

  it('rejects an empty string', () => {
    expect(() => parseAccountName('')).toThrow(/accountId must be a non-empty string/);
  });

  it('rejects a properties/-qualified name (wrong resource type)', () => {
    expect(() => parseAccountName('properties/789')).toThrow(/must be a numeric ID/);
  });
});

// ---------------------------------------------------------------------------
// parseStreamId
// ---------------------------------------------------------------------------

describe('parseStreamId', () => {
  it('returns a bare numeric id unchanged', () => {
    expect(parseStreamId('987654')).toBe('987654');
  });

  it('trims surrounding whitespace', () => {
    expect(parseStreamId('  321  ')).toBe('321');
  });

  it('coerces a numeric (non-string) input via String()', () => {
    expect(parseStreamId(321 as unknown as string)).toBe('321');
  });

  it('rejects a non-numeric id', () => {
    expect(() => parseStreamId('abc')).toThrow(/streamId must be a numeric ID/);
  });

  it('rejects an empty string', () => {
    expect(() => parseStreamId('')).toThrow(/INVALID_ARGUMENT/);
  });

  it('rejects a full resource path (only the bare id is accepted)', () => {
    expect(() => parseStreamId('properties/1/dataStreams/2')).toThrow(/INVALID_ARGUMENT/);
  });
});

// ---------------------------------------------------------------------------
// propertyIdOf
// ---------------------------------------------------------------------------

describe('propertyIdOf', () => {
  it('strips the properties/ prefix to the bare id', () => {
    expect(propertyIdOf('properties/123456')).toBe('123456');
  });

  it('returns undefined for null', () => {
    expect(propertyIdOf(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(propertyIdOf(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string (falsy)', () => {
    expect(propertyIdOf('')).toBeUndefined();
  });

  it('returns the input unchanged when it is already a bare id', () => {
    expect(propertyIdOf('123456')).toBe('123456');
  });

  it('returns the input unchanged when the prefix has a non-numeric tail', () => {
    expect(propertyIdOf('properties/abc')).toBe('properties/abc');
  });

  it('does not partial-match a deeper resource path', () => {
    expect(propertyIdOf('properties/123/dataStreams/9')).toBe('properties/123/dataStreams/9');
  });
});

// ---------------------------------------------------------------------------
// accountIdOf
// ---------------------------------------------------------------------------

describe('accountIdOf', () => {
  it('strips the accounts/ prefix to the bare id', () => {
    expect(accountIdOf('accounts/789')).toBe('789');
  });

  it('returns undefined for null', () => {
    expect(accountIdOf(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(accountIdOf(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string (falsy)', () => {
    expect(accountIdOf('')).toBeUndefined();
  });

  it('returns the input unchanged when it is already a bare id', () => {
    expect(accountIdOf('789')).toBe('789');
  });

  it('returns the input unchanged when the prefix has a non-numeric tail', () => {
    expect(accountIdOf('accounts/xyz')).toBe('accounts/xyz');
  });
});

// ---------------------------------------------------------------------------
// pick
// ---------------------------------------------------------------------------

describe('pick', () => {
  const picked = (v: unknown) => v as Record<string, unknown> | undefined;

  it('keeps only the declared keys and drops everything else', () => {
    expect(picked(pick({ a: 1, b: 2, c: 3, secret: 'shhh' }, ['a', 'c']))).toEqual({
      a: 1,
      c: 3,
    });
  });

  it('keeps falsy-but-defined values (0, "", false) -- only null/undefined are dropped', () => {
    const obj = { a: 0, b: '', c: false, d: null, e: undefined };
    expect(picked(pick(obj, ['a', 'b', 'c', 'd', 'e']))).toEqual({ a: 0, b: '', c: false });
  });

  it('drops keys whose value is null or undefined', () => {
    const obj: Record<string, unknown> = { keep: 'yes', gone: null, missing: undefined };
    expect(picked(pick(obj, ['keep', 'gone', 'missing']))).toEqual({ keep: 'yes' });
  });

  it('returns an empty object when none of the keys are present with values', () => {
    const obj: Record<string, unknown> = { a: undefined };
    expect(picked(pick(obj, ['a']))).toEqual({});
  });

  it('returns undefined for a null source object', () => {
    expect(pick<{ a: number }, 'a'>(null, ['a'])).toBeUndefined();
  });

  it('returns undefined for an undefined source object', () => {
    expect(pick<{ a: number }, 'a'>(undefined, ['a'])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mapAnalyticsError
// ---------------------------------------------------------------------------

/** Run mapAnalyticsError and return the thrown message; fail if it returns. */
function thrownMessage(err: unknown): string {
  try {
    mapAnalyticsError(err);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('expected mapAnalyticsError to throw, but it returned normally');
}

describe('mapAnalyticsError -- status -> issue code (exact message)', () => {
  it('401 -> AUTH_EXPIRED, preserving the literal upstream message', () => {
    expect(thrownMessage({ code: 401, message: 'Invalid Credentials' })).toBe(
      '[AUTH_EXPIRED] Invalid Credentials',
    );
  });

  it('404 -> NOT_FOUND', () => {
    expect(thrownMessage({ code: 404, message: 'Property not found' })).toBe(
      '[NOT_FOUND] Property not found',
    );
  });

  it('429 -> RATE_LIMITED', () => {
    expect(thrownMessage({ code: 429, message: 'Too many requests' })).toBe(
      '[RATE_LIMITED] Too many requests',
    );
  });

  it('400 -> INVALID_ARGUMENT', () => {
    expect(thrownMessage({ code: 400, message: 'Invalid value for: metrics' })).toBe(
      '[INVALID_ARGUMENT] Invalid value for: metrics',
    );
  });

  it('500 -> DEPENDENCY_UNAVAILABLE (boundary of the >=500 branch)', () => {
    expect(thrownMessage({ code: 500, message: 'Internal error' })).toBe(
      '[DEPENDENCY_UNAVAILABLE] Internal error',
    );
  });

  it('503 -> DEPENDENCY_UNAVAILABLE', () => {
    expect(thrownMessage({ code: 503, message: 'Backend unavailable' })).toBe(
      '[DEPENDENCY_UNAVAILABLE] Backend unavailable',
    );
  });

  it('an unmapped 4xx (418) -> UNKNOWN', () => {
    expect(thrownMessage({ code: 418, message: 'teapot' })).toBe('[UNKNOWN] teapot');
  });
});

describe('mapAnalyticsError -- 403 sub-classification by message', () => {
  it('403 + quota wording -> RATE_LIMITED', () => {
    expect(thrownMessage({ code: 403, message: 'Quota exceeded for metric X' })).toBe(
      '[RATE_LIMITED] Quota exceeded for metric X',
    );
  });

  it('403 + rate wording -> RATE_LIMITED', () => {
    expect(thrownMessage({ code: 403, message: 'User rate limit exceeded' })).toBe(
      '[RATE_LIMITED] User rate limit exceeded',
    );
  });

  it('403 + scope wording -> INSUFFICIENT_SCOPE', () => {
    expect(
      thrownMessage({ code: 403, message: 'Request had insufficient authentication scopes' }),
    ).toBe('[INSUFFICIENT_SCOPE] Request had insufficient authentication scopes');
  });

  it('403 + permission wording -> INSUFFICIENT_SCOPE', () => {
    expect(thrownMessage({ code: 403, message: 'The caller does not have permission' })).toBe(
      '[INSUFFICIENT_SCOPE] The caller does not have permission',
    );
  });

  it('403 with no special wording -> FORBIDDEN', () => {
    expect(thrownMessage({ code: 403, message: 'Forbidden' })).toBe('[FORBIDDEN] Forbidden');
  });

  it('403 quota wording wins over scope (quota|rate is checked first)', () => {
    expect(thrownMessage({ code: 403, message: 'Quota exceeded for this scope' })).toBe(
      '[RATE_LIMITED] Quota exceeded for this scope',
    );
  });
});

describe('mapAnalyticsError -- code source & message precedence', () => {
  it('derives the code from response.status when err.code is absent', () => {
    expect(
      thrownMessage({
        response: { status: 404, data: { error: { message: 'No such property' } } },
      }),
    ).toBe('[NOT_FOUND] No such property');
  });

  it('prefers err.message over the nested response error message', () => {
    expect(
      thrownMessage({
        code: 400,
        message: 'top-level',
        response: { data: { error: { message: 'nested' } } },
      }),
    ).toBe('[INVALID_ARGUMENT] top-level');
  });

  it('falls back to the nested response error message when no top-level message', () => {
    expect(
      thrownMessage({ code: 401, response: { data: { error: { message: 'from nested' } } } }),
    ).toBe('[AUTH_EXPIRED] from nested');
  });

  it('falls back to a generic message when none is provided', () => {
    expect(thrownMessage({ code: 500 })).toBe(
      '[DEPENDENCY_UNAVAILABLE] Google Analytics API error',
    );
  });

  it('no recognizable code -> UNKNOWN with the generic message', () => {
    expect(thrownMessage({ foo: 'bar' })).toBe('[UNKNOWN] Google Analytics API error');
  });

  it('a null error throws UNKNOWN without crashing on property access', () => {
    expect(thrownMessage(null)).toBe('[UNKNOWN] Google Analytics API error');
  });
});

describe('mapAnalyticsError -- robust status sourcing (gaxios shapes)', () => {
  it('reads the numeric status from err.status (modern gaxios)', () => {
    expect(thrownMessage({ status: 503, message: 'Service Unavailable' })).toBe(
      '[DEPENDENCY_UNAVAILABLE] Service Unavailable',
    );
  });

  it('reads err.status for a 401 (AUTH_EXPIRED)', () => {
    expect(thrownMessage({ status: 401, message: 'Invalid Credentials' })).toBe(
      '[AUTH_EXPIRED] Invalid Credentials',
    );
  });

  it('a STRING err.code does NOT shadow the numeric response.status', () => {
    expect(
      thrownMessage({
        code: 'ERR_BAD_REQUEST',
        response: { status: 400, data: { error: { message: 'Field metrics is required' } } },
      }),
    ).toBe('[INVALID_ARGUMENT] Field metrics is required');
  });
});

describe('mapAnalyticsError -- transport errors without an HTTP status', () => {
  for (const code of ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']) {
    it(`${code} -> DEPENDENCY_UNAVAILABLE`, () => {
      expect(thrownMessage({ code, message: `network error: ${code}` })).toBe(
        `[DEPENDENCY_UNAVAILABLE] network error: ${code}`,
      );
    });
  }

  it('preserves the literal upstream message for a timeout', () => {
    expect(
      thrownMessage({
        code: 'ETIMEDOUT',
        message: 'request to analyticsdata.googleapis.com timed out',
      }),
    ).toBe('[DEPENDENCY_UNAVAILABLE] request to analyticsdata.googleapis.com timed out');
  });
});

// ---------------------------------------------------------------------------
// curateReport
// ---------------------------------------------------------------------------

describe('curateReport -- full report', () => {
  const raw = {
    dimensionHeaders: [{ name: 'country' }, { name: 'deviceCategory' }],
    metricHeaders: [
      { name: 'activeUsers', type: 'TYPE_INTEGER' },
      { name: 'sessions', type: 'TYPE_INTEGER' },
    ],
    rows: [
      {
        dimensionValues: [{ value: 'US' }, { value: 'mobile' }],
        metricValues: [{ value: '1234' }, { value: '2000' }],
      },
      {
        dimensionValues: [{ value: 'ES' }, { value: 'desktop' }],
        metricValues: [{ value: '567' }, { value: '800' }],
      },
    ],
    rowCount: 2,
    totals: [
      {
        dimensionValues: [{ value: 'RESERVED_TOTAL' }],
        metricValues: [{ value: '1801' }, { value: '2800' }],
      },
    ],
    minimums: [{ metricValues: [{ value: '567' }, { value: '800' }] }],
    maximums: [{ metricValues: [{ value: '1234' }, { value: '2000' }] }],
    metadata: {
      currencyCode: 'USD',
      timeZone: 'America/Los_Angeles',
      subjectToThresholding: true,
    },
    propertyQuota: { tokensPerDay: { consumed: 4, remaining: 996 } },
  };

  it('produces the exact curated payload', () => {
    expect(curateReport(raw)).toEqual({
      dimensionHeaders: [{ name: 'country' }, { name: 'deviceCategory' }],
      metricHeaders: [
        { name: 'activeUsers', type: 'TYPE_INTEGER' },
        { name: 'sessions', type: 'TYPE_INTEGER' },
      ],
      rows: [
        { dimensionValues: ['US', 'mobile'], metricValues: ['1234', '2000'] },
        { dimensionValues: ['ES', 'desktop'], metricValues: ['567', '800'] },
      ],
      rowCount: 2,
      totals: [['1801', '2800']],
      minimums: [['567', '800']],
      maximums: [['1234', '2000']],
      metadata: { currencyCode: 'USD', timeZone: 'America/Los_Angeles' },
      propertyQuota: { tokensPerDay: { consumed: 4, remaining: 996 } },
    });
  });
});

describe('curateReport -- rowCount', () => {
  const oneRow = {
    rows: [{ dimensionValues: [{ value: 'a' }], metricValues: [{ value: '1' }] }],
  };

  it('uses the upstream rowCount even when it exceeds the returned rows (paged result)', () => {
    expect(curateReport({ ...oneRow, rowCount: 5000 }).rowCount).toBe(5000);
  });

  it('falls back to rows.length when rowCount is absent', () => {
    expect(curateReport(oneRow).rowCount).toBe(1);
  });

  it('falls back to 0 for an empty response', () => {
    expect(curateReport({}).rowCount).toBe(0);
  });
});

describe('curateReport -- boundaries', () => {
  it('returns empty arrays and undefined optionals for an empty response', () => {
    const out = curateReport({});
    expect(out.dimensionHeaders).toEqual([]);
    expect(out.metricHeaders).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.totals).toBeUndefined();
    expect(out.minimums).toBeUndefined();
    expect(out.maximums).toBeUndefined();
    expect(out.metadata).toBeUndefined();
    expect(out.propertyQuota).toBeUndefined();
  });

  it('defaults missing dimensionValues/metricValues on a row to empty arrays', () => {
    expect(curateReport({ rows: [{}] }).rows).toEqual([{ dimensionValues: [], metricValues: [] }]);
  });

  it('keeps metadata.currencyCode and leaves timeZone undefined when partial', () => {
    const out = curateReport({ metadata: { currencyCode: 'EUR' } });
    expect(out.metadata?.currencyCode).toBe('EUR');
    expect(out.metadata?.timeZone).toBeUndefined();
  });

  it('omits metadata entirely when absent (not an empty object)', () => {
    expect(curateReport({ rows: [] }).metadata).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildReportRequest
// ---------------------------------------------------------------------------

const DR = { startDate: '7daysAgo', endDate: 'yesterday' };

describe('buildReportRequest -- normalization (run-report shape)', () => {
  it('maps dimensions and metrics from string[] to [{ name }]', () => {
    const body = buildReportRequest({
      dimensions: ['country', 'deviceCategory'],
      metrics: ['activeUsers', 'sessions'],
      dateRanges: [DR],
    });
    expect(body.dimensions).toEqual([{ name: 'country' }, { name: 'deviceCategory' }]);
    expect(body.metrics).toEqual([{ name: 'activeUsers' }, { name: 'sessions' }]);
  });

  it('defaults dimensions to [] when omitted (metrics still required)', () => {
    const body = buildReportRequest({ metrics: ['activeUsers'], dateRanges: [DR] });
    expect(body.dimensions).toEqual([]);
  });

  it('coerces limit to a STRING (100 -> "100")', () => {
    expect(buildReportRequest({ metrics: ['x'], dateRanges: [DR], limit: 100 }).limit).toBe('100');
  });

  it('coerces offset to a STRING and KEEPS the boundary value 0 ("0", not dropped)', () => {
    expect(buildReportRequest({ metrics: ['x'], dateRanges: [DR], offset: 0 }).offset).toBe('0');
  });

  it('coerces the boundary value limit:0 to "0"', () => {
    expect(buildReportRequest({ metrics: ['x'], dateRanges: [DR], limit: 0 }).limit).toBe('0');
  });

  it('leaves limit/offset undefined when not provided', () => {
    const body = buildReportRequest({ metrics: ['x'], dateRanges: [DR] });
    expect(body.limit).toBeUndefined();
    expect(body.offset).toBeUndefined();
  });

  it('produces the exact full request body, passing filters/orderBys through verbatim', () => {
    const body = buildReportRequest({
      dimensions: ['country'],
      metrics: ['activeUsers', 'sessions'],
      dateRanges: [DR],
      dimensionFilter: { filter: { fieldName: 'country' } },
      metricFilter: { filter: { fieldName: 'sessions' } },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 100,
      offset: 20,
      keepEmptyRows: true,
      returnPropertyQuota: true,
      currencyCode: 'USD',
      metricAggregations: ['TOTAL'],
    });
    expect(body).toEqual({
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      dimensionFilter: { filter: { fieldName: 'country' } },
      metricFilter: { filter: { fieldName: 'sessions' } },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: '100',
      offset: '20',
      keepEmptyRows: true,
      returnPropertyQuota: true,
      currencyCode: 'USD',
      metricAggregations: ['TOTAL'],
      dateRanges: [DR],
    });
  });
});

describe('buildReportRequest -- required-field validation', () => {
  it('throws INVALID_ARGUMENT when metrics is empty', () => {
    expect(() => buildReportRequest({ metrics: [], dateRanges: [DR] })).toThrow(
      /metrics must contain at least one entry/,
    );
  });

  it('throws INVALID_ARGUMENT when metrics is missing', () => {
    expect(() => buildReportRequest({ dateRanges: [DR] } as any)).toThrow(/metrics must contain/);
  });

  it('checks metrics BEFORE dateRanges (metrics error wins when both are absent)', () => {
    expect(() => buildReportRequest({} as any)).toThrow(/metrics must contain/);
  });

  it('throws INVALID_ARGUMENT when dateRanges is missing (non-realtime)', () => {
    expect(() => buildReportRequest({ metrics: ['activeUsers'] } as any)).toThrow(
      /dateRanges must contain at least one entry/,
    );
  });

  it('throws INVALID_ARGUMENT when dateRanges is an empty array (non-realtime)', () => {
    expect(() => buildReportRequest({ metrics: ['activeUsers'], dateRanges: [] })).toThrow(
      /dateRanges must contain/,
    );
  });
});

describe('buildReportRequest -- realtime mode', () => {
  it('does NOT require dateRanges', () => {
    expect(() =>
      buildReportRequest({ metrics: ['activeUsers'] } as any, { realtime: true }),
    ).not.toThrow();
  });

  it('still requires metrics', () => {
    expect(() => buildReportRequest({ metrics: [] }, { realtime: true })).toThrow(
      /metrics must contain/,
    );
  });

  it('normalizes dims/metrics and coerces limit, but DROPS the date-bound fields', () => {
    const body = buildReportRequest(
      {
        dimensions: ['country'],
        metrics: ['activeUsers'],
        limit: 50,
        returnPropertyQuota: true,
        dateRanges: [DR],
        offset: 99,
        currencyCode: 'EUR',
        metricAggregations: ['TOTAL'],
        keepEmptyRows: true,
      },
      { realtime: true },
    );
    expect(body.dimensions).toEqual([{ name: 'country' }]);
    expect(body.metrics).toEqual([{ name: 'activeUsers' }]);
    expect(body.limit).toBe('50');
    expect('dateRanges' in body).toBe(false);
    expect('offset' in body).toBe(false);
    expect('currencyCode' in body).toBe(false);
    expect('metricAggregations' in body).toBe(false);
    expect('keepEmptyRows' in body).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyAccountsProbe
// ---------------------------------------------------------------------------

describe('classifyAccountsProbe -- account count', () => {
  it('0 accounts -> USER_CONFIG_MISSING (user_action)', () => {
    const issue = classifyAccountsProbe({ accountCount: 0 });
    expect(issue?.code).toBe('USER_CONFIG_MISSING');
    expect(issue?.action.type).toBe('user_action');
  });

  it('exactly 1 account -> healthy (null) -- the >=1 boundary', () => {
    expect(classifyAccountsProbe({ accountCount: 1 })).toBeNull();
  });

  it('many accounts -> healthy (null)', () => {
    expect(classifyAccountsProbe({ accountCount: 5 })).toBeNull();
  });
});

describe('classifyAccountsProbe -- error classification', () => {
  it('403 + quota wording -> RATE_LIMITED (auto_retry), NOT AUTH_EXPIRED', () => {
    const issue = classifyAccountsProbe({
      error: { status: 403, message: "Quota exceeded for quota metric 'Core Tokens'" },
    });
    expect(issue?.code).toBe('RATE_LIMITED');
    expect(issue?.action.type).toBe('auto_retry');
  });

  it('403 + rate wording -> RATE_LIMITED', () => {
    expect(
      classifyAccountsProbe({ error: { status: 403, message: 'User rate limit exceeded' } })?.code,
    ).toBe('RATE_LIMITED');
  });

  it('403 + permission/scope wording -> AUTH_EXPIRED (reconnect)', () => {
    const issue = classifyAccountsProbe({
      error: { status: 403, message: 'The caller does not have permission' },
    });
    expect(issue?.code).toBe('AUTH_EXPIRED');
    expect(issue?.action.type).toBe('user_action');
  });

  it('401 -> AUTH_EXPIRED', () => {
    expect(classifyAccountsProbe({ error: { status: 401 } })?.code).toBe('AUTH_EXPIRED');
  });

  it('reads the status from a modern gaxios shape (string code + response.status)', () => {
    const issue = classifyAccountsProbe({
      error: { code: 'ERR_BAD_REQUEST', response: { status: 401 } },
    });
    expect(issue?.code).toBe('AUTH_EXPIRED');
  });

  it('a transport error (string code, no status) -> DEPENDENCY_UNAVAILABLE', () => {
    const issue = classifyAccountsProbe({ error: { code: 'ENOTFOUND', message: 'dns failure' } });
    expect(issue?.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(issue?.action.type).toBe('auto_retry');
  });

  it('a 500 -> DEPENDENCY_UNAVAILABLE, embedding the upstream message', () => {
    const issue = classifyAccountsProbe({ error: { status: 500, message: 'Internal error' } });
    expect(issue?.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(issue?.message).toContain('Internal error');
  });
});
