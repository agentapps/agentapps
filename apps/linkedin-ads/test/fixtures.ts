/**
 * Mock response bodies built from the response shapes in LinkedIn's Marketing API docs
 * (version 202610), with synthetic values. Real types are kept: entity ids are numbers,
 * creative ids are URN strings, budgets and costs are decimal strings, times are epoch ms.
 */

export const account = {
  test: false,
  changeAuditStamps: {
    created: { actor: 'urn:li:person:AbCdEf123', time: 1449768717000 },
    lastModified: { actor: 'urn:li:unknown:0', time: 1477941718075 },
  },
  currency: 'EUR',
  id: 508000001,
  name: 'Example GmbH',
  notifiedOnCampaignOptimization: true,
  notifiedOnCreativeApproval: true,
  notifiedOnCreativeRejection: true,
  notifiedOnEndOfCampaign: true,
  reference: 'urn:li:organization:1000001',
  servingStatuses: ['BILLING_HOLD'],
  status: 'ACTIVE',
  type: 'BUSINESS',
  version: { versionTag: '4' },
};

export const accountSearch = {
  elements: [account],
  metadata: { nextPageToken: 'DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo' },
};

export const campaignGroup = {
  runSchedule: { start: 1493228897000 },
  changeAuditStamps: { created: { time: 1493228897000 }, lastModified: { time: 1493228897000 } },
  name: 'Q4 demand gen',
  test: false,
  servingStatuses: ['RUNNABLE'],
  backfilled: false,
  id: 604000001,
  account: 'urn:li:sponsoredAccount:508000001',
  status: 'ACTIVE',
  totalBudget: { amount: '60000', currencyCode: 'EUR' },
};

export const campaign = {
  account: 'urn:li:sponsoredAccount:508000001',
  associatedEntity: 'urn:li:organization:1000001',
  audienceExpansionEnabled: false,
  campaignGroup: 'urn:li:sponsoredCampaignGroup:604000001',
  changeAuditStamps: { created: { time: 1530119777000 }, lastModified: { time: 1530119777000 } },
  costType: 'CPC',
  connectedTelevisionOnly: false,
  creativeSelection: 'OPTIMIZED',
  dailyBudget: { amount: '1800', currencyCode: 'EUR' },
  id: 141000001,
  locale: { country: 'DE', language: 'de' },
  name: 'Sponsored update B',
  offsiteDeliveryEnabled: false,
  optimizationTargetType: 'NONE',
  test: false,
  runSchedule: { end: 1798761600000, start: 1767225600000 },
  servingStatuses: ['ACCOUNT_SERVING_HOLD'],
  status: 'ACTIVE',
  targetingCriteria: {
    include: {
      and: [
        { or: { 'urn:li:adTargetingFacet:employers': ['urn:li:company:0000'] } },
        { or: { 'urn:li:adTargetingFacet:locations': ['urn:li:geo:101282230'] } },
        { or: { 'urn:li:adTargetingFacet:interfaceLocales': ['urn:li:locale:de_DE'] } },
      ],
    },
  },
  type: 'SPONSORED_UPDATES',
  unitCost: { amount: '15', currencyCode: 'EUR' },
  version: { versionTag: '1' },
};

export const creative = {
  createdAt: 1624249280000,
  servingHoldReasons: ['STOPPED', 'CAMPAIGN_STOPPED'],
  lastModifiedAt: 1624249280000,
  isTest: false,
  createdBy: 'urn:li:person:AbCdEf123',
  isServing: false,
  name: 'Creative 1',
  lastModifiedBy: 'urn:li:person:AbCdEf123',
  campaign: 'urn:li:sponsoredCampaign:141000001',
  id: 'urn:li:sponsoredCreative:119000001',
  intendedStatus: 'DRAFT',
  account: 'urn:li:sponsoredAccount:508000001',
  content: { reference: 'urn:li:share:6778045555198214144' },
};

/** A DAILY statistics row: costs are decimal strings, dates are Rest.li date records. */
export function analyticsRow(day: number, campaignId = 141000001) {
  return {
    pivotValues: [`urn:li:sponsoredCampaign:${campaignId}`],
    dateRange: {
      start: { month: 5, year: 2026, day },
      end: { month: 5, year: 2026, day },
    },
    landingPageClicks: 11,
    costInLocalCurrency: '19.91833',
    impressions: 165,
    clicks: 12,
  };
}
