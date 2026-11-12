/**
 * Mock bodies shaped like real Google Ads REST (v26) responses, with synthetic values.
 *
 * What the real API does and these mocks keep: int64 fields (ids, impressions, clicks,
 * *Micros) are JSON strings, doubles (ctr, conversions, averageCpc in micros) are numbers,
 * fields at their default value (0, false) are omitted, every entity carries its
 * resourceName, and errors come as google.rpc.Status with a GoogleAdsFailure detail.
 */

import type { Mock } from 'vitest';
import { jsonResponse, requestOf } from './harness.js';

export const CUSTOMER = '1234567890';
export const MANAGER = '9876543210';

export function adsFailure(
  status: number,
  rpcStatus: string,
  errors: Array<{ errorCode: Record<string, string>; message: string }>,
  requestId = 'synthetic-request-id-1',
): Response {
  return jsonResponse(
    {
      error: {
        code: status,
        message: 'Request contains an invalid argument.',
        status: rpcStatus,
        details: [
          {
            '@type': 'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure',
            errors,
            requestId,
          },
        ],
      },
    },
    status,
  );
}

export function searchPage(results: unknown[], extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ results, fieldMask: 'synthetic.fieldMask', ...extra });
}

/** The parsed JSON body and headers of the n-th request. */
export function sent(fetchMock: Mock, index = 0) {
  const { url, init } = requestOf(fetchMock, index);
  return {
    url,
    method: init.method,
    headers: (init.headers ?? {}) as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
}

export const campaignRow = (
  id: string,
  name: string,
  metrics: Record<string, unknown> = {},
  status = 'ENABLED',
) => ({
  customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
  campaign: {
    resourceName: `customers/${CUSTOMER}/campaigns/${id}`,
    name,
    status,
    advertisingChannelType: 'SEARCH',
    id,
  },
  metrics,
});

export const BUSY_METRICS = {
  clicks: '152',
  costMicros: '84320000',
  ctr: 0.06121626,
  averageCpc: 554736.8421052631,
  impressions: '2483',
  conversions: 12.5,
  conversionsValue: 1250.75,
};
