/**
 * GAQL search and result shaping.
 *
 * Google Ads REST responses follow the proto3 JSON mapping: int64 values (ids,
 * impressions, clicks, cost in micros) arrive as strings, doubles (ctr, conversions)
 * as numbers, and fields at their default value (0, false, empty) are left out. The
 * helpers here turn that into plain numbers with zeros filled in.
 */

import { adsRequest, type ClientContext } from './client.js';

/** Results stay well under the SDK's 50,000-character limit. */
export const RESULT_BUDGET_CHARS = 45_000;

export type Row = Record<string, any>;

export interface SearchResponse {
  results?: Row[];
  nextPageToken?: string;
  fieldMask?: string;
}

/** Runs one page of a GAQL query (googleAds:search is read-only, so it may retry). */
export function search(
  ctx: ClientContext,
  customerId: string,
  query: string,
  options: { loginCustomerId?: string; pageToken?: string; timeoutMs?: number } = {},
): Promise<SearchResponse> {
  const body: Record<string, unknown> = { query };
  if (options.pageToken) body.pageToken = options.pageToken;
  return adsRequest<SearchResponse>('POST', `/customers/${customerId}/googleAds:search`, ctx, {
    body,
    loginCustomerId: options.loginCustomerId,
    timeoutMs: options.timeoutMs,
    idempotent: true,
  }).then((r) => r ?? {});
}

/** An int64 or double field as a number; missing (proto3 default) means 0. */
export function num(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Micros (1,000,000 per currency unit) to currency units. */
export function fromMicros(value: unknown): number {
  return Math.round(num(value)) / 1_000_000;
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export const METRIC_FIELDS = [
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.cost_micros',
  'metrics.conversions',
  'metrics.conversions_value',
];

export interface Metrics {
  impressions: number;
  clicks: number;
  ctr: number;
  averageCpc: number;
  cost: number;
  conversions: number;
  conversionsValue: number;
  costPerConversion: number | null;
}

/** The standard metrics of a row, money in account currency units. */
export function metricsOf(row: Row): Metrics {
  const m = row.metrics ?? {};
  const cost = fromMicros(m.costMicros);
  const conversions = round(num(m.conversions), 2);
  return {
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    ctr: round(num(m.ctr), 4),
    averageCpc: round(fromMicros(m.averageCpc), 2),
    cost: round(cost, 2),
    conversions,
    conversionsValue: round(num(m.conversionsValue), 2),
    costPerConversion: conversions > 0 ? round(cost / conversions, 2) : null,
  };
}

/**
 * Adds items while the serialized list stays under the budget. Returns the kept items
 * and whether the budget cut the list short.
 */
export function withinBudget<T>(
  items: T[],
  budget = RESULT_BUDGET_CHARS,
): { kept: T[]; cut: boolean } {
  const kept: T[] = [];
  let size = 2;
  for (const item of items) {
    size += JSON.stringify(item).length + 1;
    if (size > budget) return { kept, cut: true };
    kept.push(item);
  }
  return { kept, cut: false };
}
