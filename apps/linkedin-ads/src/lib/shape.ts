/**
 * Curated shapes of LinkedIn ad entities: ids, names, status, budgets and dates, without
 * the audit stamps and version tags the API adds to every record.
 */

import { idFromUrn, isoTime, money } from './args.js';

type Raw = Record<string, unknown>;

/** Search responses: `{ elements: [...], metadata: { nextPageToken } }`. */
export interface SearchResponse {
  elements?: Raw[];
  metadata?: { nextPageToken?: string | null };
}

function runSchedule(value: unknown): { start: string | null; end: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Raw;
  return { start: isoTime(r.start), end: isoTime(r.end) };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function shapeAccount(a: Raw) {
  return {
    id: String(a.id),
    name: a.name ?? null,
    status: a.status ?? null,
    type: a.type ?? null,
    currency: a.currency ?? null,
    servingStatuses: strings(a.servingStatuses),
    reference: a.reference ?? null,
    test: a.test === true,
  };
}

export function shapeCampaignGroup(g: Raw) {
  const optimization = (g.budgetOptimization ?? null) as Raw | null;
  return {
    id: String(g.id),
    name: g.name ?? null,
    status: g.status ?? null,
    servingStatuses: strings(g.servingStatuses),
    objectiveType: g.objectiveType ?? null,
    totalBudget: money(g.totalBudget),
    // A plain decimal on campaign groups with dynamic budget optimization.
    dailyBudget: g.dailyBudget ?? null,
    budgetOptimizationStrategy: optimization?.budgetOptimizationStrategy ?? null,
    runSchedule: runSchedule(g.runSchedule),
    backfilled: g.backfilled === true,
    test: g.test === true,
  };
}

export function shapeCampaign(c: Raw) {
  return {
    id: String(c.id),
    name: c.name ?? null,
    status: c.status ?? null,
    servingStatuses: strings(c.servingStatuses),
    campaignGroupId: idFromUrn(c.campaignGroup),
    type: c.type ?? null,
    format: c.format ?? null,
    objectiveType: c.objectiveType ?? null,
    costType: c.costType ?? null,
    optimizationTargetType: c.optimizationTargetType ?? null,
    dailyBudget: money(c.dailyBudget),
    totalBudget: money(c.totalBudget),
    unitCost: money(c.unitCost),
    runSchedule: runSchedule(c.runSchedule),
    test: c.test === true,
  };
}

export function shapeCreative(c: Raw) {
  const review = (c.review ?? null) as Raw | null;
  const content = (c.content ?? null) as Raw | null;
  return {
    id: idFromUrn(c.id),
    urn: c.id ?? null,
    name: c.name ?? null,
    campaignId: idFromUrn(c.campaign),
    intendedStatus: c.intendedStatus ?? null,
    isServing: c.isServing === true,
    servingHoldReasons: strings(c.servingHoldReasons),
    reviewStatus: review?.status ?? null,
    contentReference: typeof content?.reference === 'string' ? content.reference : null,
    createdAt: isoTime(c.createdAt),
    lastModifiedAt: isoTime(c.lastModifiedAt),
    test: c.isTest === true,
  };
}
