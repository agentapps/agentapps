/**
 * Read tools: the outgoing Rest.li request (path, finder, encoded query), the curated
 * result shape, argument validation before any request, and result size bounds.
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  account,
  accountSearch,
  analyticsRow,
  campaign,
  campaignGroup,
  creative,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

type Result = Record<string, unknown>;
const resultOf = (msg: Record<string, unknown>) => msg.result as Result;

describe('list-ad-accounts', () => {
  it('searches with status and test filters and returns curated accounts', async () => {
    const fetchMock = mockFetch(jsonResponse(accountSearch));
    const msg = await callTool('list-ad-accounts', {
      status: ['active', 'CANCELED'],
      test: false,
      pageSize: 10,
      pageToken: 'abc_123',
    });
    expect(msg.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(url.href).toBe(
      `${BASE_URL}/adAccounts?q=search&search=(status:(values:List(ACTIVE,CANCELED)),test:false)` +
        '&pageSize=10&pageToken=abc_123',
    );
    expect(resultOf(msg)).toEqual({
      accounts: [
        {
          id: '508000001',
          name: 'Example GmbH',
          status: 'ACTIVE',
          type: 'BUSINESS',
          currency: 'EUR',
          servingStatuses: ['BILLING_HOLD'],
          reference: 'urn:li:organization:1000001',
          test: false,
        },
      ],
      count: 1,
      nextPageToken: 'DgGerr1iVQreCJVjZDOW_grcp63nueBDipsS4DJpvJo',
    });
  });

  it('omits the search criteria when no filter is given', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [], metadata: {} }));
    const msg = await callTool('list-ad-accounts', {});
    expect(requestOf(fetchMock).url.href).toBe(`${BASE_URL}/adAccounts?q=search&pageSize=50`);
    expect(resultOf(msg)).toEqual({ accounts: [], count: 0, nextPageToken: null });
  });

  it('rejects an unknown status and an out-of-range pageSize before any request', async () => {
    const fetchMock = mockFetch();
    const bad1 = await callTool('list-ad-accounts', { status: ['PAUSED'] });
    const bad2 = await callTool('list-ad-accounts', { pageSize: 500 });
    expect(JSON.stringify(bad1.error)).toContain('[BAD_REQUEST] status must be one of');
    expect(JSON.stringify(bad2.error)).toContain('pageSize must be an integer from 1 to 100');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays under 50,000 characters with a full page of long names', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      ...account,
      id: 508000000 + i,
      name: 'N'.repeat(200),
    }));
    mockFetch(jsonResponse({ elements: many, metadata: { nextPageToken: 't' } }));
    const msg = await callTool('list-ad-accounts', { pageSize: 100 });
    expect(msg.success).toBe(true);
    expect(JSON.stringify(msg.result).length).toBeLessThan(50_000);
  });
});

describe('list-campaign-groups', () => {
  it('searches the account with the default statuses', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ elements: [campaignGroup], metadata: { nextPageToken: null } }),
    );
    const msg = await callTool('list-campaign-groups', { accountId: 508000001 });
    expect(requestOf(fetchMock).url.href).toBe(
      `${BASE_URL}/adAccounts/508000001/adCampaignGroups?q=search` +
        '&search=(status:(values:List(ACTIVE,PAUSED,DRAFT)))&pageSize=50',
    );
    expect(resultOf(msg)).toEqual({
      campaignGroups: [
        {
          id: '604000001',
          name: 'Q4 demand gen',
          status: 'ACTIVE',
          servingStatuses: ['RUNNABLE'],
          objectiveType: null,
          totalBudget: { amount: '60000', currencyCode: 'EUR' },
          dailyBudget: null,
          budgetOptimizationStrategy: null,
          runSchedule: { start: '2017-04-26T17:48:17.000Z', end: null },
          backfilled: false,
          test: false,
        },
      ],
      count: 1,
      nextPageToken: null,
    });
  });

  it('accepts the account URN and rejects a path-like id', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [] }));
    await callTool('list-campaign-groups', {
      accountId: 'urn:li:sponsoredAccount:508000001',
      status: ['ARCHIVED'],
    });
    expect(requestOf(fetchMock).url.pathname).toBe('/rest/adAccounts/508000001/adCampaignGroups');

    const bad = await callTool('list-campaign-groups', { accountId: '1/../2' });
    expect(JSON.stringify(bad.error)).toContain('[BAD_REQUEST] accountId must be a numeric id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires accountId', async () => {
    const fetchMock = mockFetch();
    const msg = await callTool('list-campaign-groups', {});
    expect(msg.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-campaigns', () => {
  it('filters by campaign group URNs, percent-encoded inside List()', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ elements: [campaign], metadata: { nextPageToken: 'next' } }),
    );
    const msg = await callTool('list-campaigns', {
      accountId: '508000001',
      campaignGroupIds: [604000001],
      status: ['ACTIVE', 'COMPLETED'],
      pageSize: 50,
    });
    expect(requestOf(fetchMock).url.href).toBe(
      `${BASE_URL}/adAccounts/508000001/adCampaigns?q=search&search=(status:(values:` +
        'List(ACTIVE,COMPLETED)),campaignGroup:(values:List(' +
        'urn%3Ali%3AsponsoredCampaignGroup%3A604000001)))&pageSize=50',
    );
    const result = resultOf(msg);
    expect(result.nextPageToken).toBe('next');
    expect((result.campaigns as Result[])[0]).toEqual({
      id: '141000001',
      name: 'Sponsored update B',
      status: 'ACTIVE',
      servingStatuses: ['ACCOUNT_SERVING_HOLD'],
      campaignGroupId: '604000001',
      type: 'SPONSORED_UPDATES',
      format: null,
      objectiveType: null,
      costType: 'CPC',
      optimizationTargetType: 'NONE',
      dailyBudget: { amount: '1800', currencyCode: 'EUR' },
      totalBudget: null,
      unitCost: { amount: '15', currencyCode: 'EUR' },
      runSchedule: { start: '2026-01-01T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' },
      test: false,
    });
  });

  it('caps pageSize at 50 and campaign groups at 20', async () => {
    const fetchMock = mockFetch();
    const big = await callTool('list-campaigns', { accountId: 1, pageSize: 51 });
    const many = await callTool('list-campaigns', {
      accountId: 1,
      campaignGroupIds: Array.from({ length: 21 }, (_, i) => i + 1),
    });
    expect(JSON.stringify(big.error)).toContain('from 1 to 50');
    expect(JSON.stringify(many.error)).toContain('at most 20 ids');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays under 50,000 characters with a full page', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      ...campaign,
      id: i,
      name: 'C'.repeat(100),
    }));
    mockFetch(jsonResponse({ elements: many }));
    const msg = await callTool('list-campaigns', { accountId: 1, pageSize: 50 });
    expect(msg.success).toBe(true);
    expect(JSON.stringify(msg.result).length).toBeLessThan(50_000);
  });
});

describe('get-campaign', () => {
  it('gets one campaign with its targeting', async () => {
    const fetchMock = mockFetch(jsonResponse(campaign));
    const msg = await callTool('get-campaign', {
      accountId: 508000001,
      campaignId: 'urn:li:sponsoredCampaign:141000001',
    });
    expect(requestOf(fetchMock).url.href).toBe(
      `${BASE_URL}/adAccounts/508000001/adCampaigns/141000001`,
    );
    const result = resultOf(msg);
    expect(result.id).toBe('141000001');
    expect(result.targetingCriteria).toEqual(campaign.targetingCriteria);
    expect(result.locale).toEqual({ country: 'DE', language: 'de' });
    expect(result.createdAt).toBe('2018-06-27T17:16:17.000Z');
    expect(result).not.toHaveProperty('version');
  });

  it('turns a 404 into NOT_FOUND with the next step', async () => {
    mockFetch(jsonResponse({ message: 'Not found', status: 404 }, 404));
    const msg = await callTool('get-campaign', { accountId: 1, campaignId: 2 });
    expect(JSON.stringify(msg.error)).toContain('[NOT_FOUND]');
    expect(JSON.stringify(msg.error)).toContain('list-campaigns');
  });

  it('rejects a campaign URN of the wrong type', async () => {
    const fetchMock = mockFetch();
    const msg = await callTool('get-campaign', {
      accountId: 1,
      campaignId: 'urn:li:sponsoredCampaignGroup:2',
    });
    expect(JSON.stringify(msg.error)).toContain('[BAD_REQUEST] campaignId');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects ids above 2^53 passed as numbers', async () => {
    const fetchMock = mockFetch();
    const msg = await callTool('get-campaign', { accountId: 1, campaignId: 2 ** 60 });
    expect(JSON.stringify(msg.error)).toContain('as a string in a JSON object');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-creatives', () => {
  it('uses the criteria finder with campaign URNs and intended statuses', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [creative], metadata: {} }));
    const msg = await callTool('list-creatives', {
      accountId: 508000001,
      campaignIds: [141000001, '141000002'],
      intendedStatus: ['ACTIVE', 'PAUSED'],
    });
    expect(requestOf(fetchMock).url.href).toBe(
      `${BASE_URL}/adAccounts/508000001/creatives?q=criteria&campaigns=List(` +
        'urn%3Ali%3AsponsoredCampaign%3A141000001,urn%3Ali%3AsponsoredCampaign%3A141000002)' +
        '&intendedStatuses=List(ACTIVE,PAUSED)&sortOrder=ASCENDING&pageSize=50',
    );
    const headers = requestOf(fetchMock).init.headers as Record<string, string>;
    expect(headers['X-RestLi-Method']).toBe('FINDER');
    expect(resultOf(msg)).toEqual({
      creatives: [
        {
          id: '119000001',
          urn: 'urn:li:sponsoredCreative:119000001',
          name: 'Creative 1',
          campaignId: '141000001',
          intendedStatus: 'DRAFT',
          isServing: false,
          servingHoldReasons: ['STOPPED', 'CAMPAIGN_STOPPED'],
          reviewStatus: null,
          contentReference: 'urn:li:share:6778045555198214144',
          createdAt: '2021-06-21T04:21:20.000Z',
          lastModifiedAt: '2021-06-21T04:21:20.000Z',
          test: false,
        },
      ],
      count: 1,
      nextPageToken: null,
    });
  });

  it('lists every creative of the account without filters', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [] }));
    await callTool('list-creatives', { accountId: 1, pageSize: 100 });
    expect(requestOf(fetchMock).url.search).toBe('?q=criteria&sortOrder=ASCENDING&pageSize=100');
  });
});

describe('get-ad-analytics', () => {
  it('uses the statistics finder with a Rest.li date range and returns columns', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [analyticsRow(1), analyticsRow(2)] }));
    const msg = await callTool('get-ad-analytics', {
      accountId: 508000001,
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      timeGranularity: 'DAILY',
      metrics: ['impressions', 'clicks', 'costInLocalCurrency'],
    });
    expect(msg.success).toBe(true);
    expect(requestOf(fetchMock).url.href).toBe(
      `${BASE_URL}/adAnalytics?q=statistics&pivots=List(CAMPAIGN)&timeGranularity=DAILY` +
        '&dateRange=(start:(year:2026,month:5,day:1),end:(year:2026,month:5,day:2))' +
        '&accounts=List(urn%3Ali%3AsponsoredAccount%3A508000001)' +
        '&fields=pivotValues,dateRange,impressions,clicks,costInLocalCurrency',
    );
    expect(resultOf(msg)).toEqual({
      pivots: ['CAMPAIGN'],
      timeGranularity: 'DAILY',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      rowCount: 2,
      columns: {
        pivotValues: [
          ['urn:li:sponsoredCampaign:141000001'],
          ['urn:li:sponsoredCampaign:141000001'],
        ],
        start: ['2026-05-01', '2026-05-02'],
        end: ['2026-05-01', '2026-05-02'],
        impressions: [165, 165],
        clicks: [12, 12],
        costInLocalCurrency: ['19.91833', '19.91833'],
      },
      limitApplied: false,
    });
  });

  it('uses the analytics finder for one demographic pivot over campaigns', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ elements: [], paging: { count: 10, start: 0, links: [] } }),
    );
    const msg = await callTool('get-ad-analytics', {
      campaignIds: [141000001],
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      pivots: ['MEMBER_JOB_FUNCTION'],
    });
    expect(requestOf(fetchMock).url.search).toBe(
      '?q=analytics&pivot=MEMBER_JOB_FUNCTION&timeGranularity=ALL' +
        '&dateRange=(start:(year:2026,month:4,day:1),end:(year:2026,month:4,day:30))' +
        '&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A141000001)' +
        '&fields=pivotValues,dateRange,impressions,clicks,costInLocalCurrency,landingPageClicks,' +
        'externalWebsiteConversions,oneClickLeads,totalEngagements',
    );
    const result = resultOf(msg);
    expect(result.rowCount).toBe(0);
    expect(result.columns).not.toHaveProperty('start');
  });

  it('accepts up to three pivots on campaign groups and creatives', async () => {
    const fetchMock = mockFetch(jsonResponse({ elements: [] }), jsonResponse({ elements: [] }));
    await callTool('get-ad-analytics', {
      campaignGroupIds: [604000001],
      startDate: '2026-01-01',
      pivots: ['CAMPAIGN', 'CREATIVE', 'CONVERSION'],
    });
    expect(requestOf(fetchMock).url.search).toContain('pivots=List(CAMPAIGN,CREATIVE,CONVERSION)');
    expect(requestOf(fetchMock).url.search).toContain(
      'campaignGroups=List(urn%3Ali%3AsponsoredCampaignGroup%3A604000001)',
    );
    await callTool('get-ad-analytics', { creativeIds: ['119000001'], startDate: '2026-01-01' });
    expect(requestOf(fetchMock, 1).url.search).toContain(
      'creatives=List(urn%3Ali%3AsponsoredCreative%3A119000001)',
    );
  });

  it('rejects bad arguments before any request', async () => {
    const fetchMock = mockFetch();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ accountId: 1 }, 'startDate must be a date'],
      [{ accountId: 1, startDate: '2026-02-30' }, 'startDate must be a date'],
      [
        { accountId: 1, startDate: '2026-05-02', endDate: '2026-05-01' },
        'endDate must not be before',
      ],
      [{ startDate: '2026-05-01' }, 'Give exactly one of accountId'],
      [{ accountId: 1, campaignIds: [2], startDate: '2026-05-01' }, 'Give exactly one of'],
      [
        { accountId: 1, startDate: '2026-01-01', endDate: '2026-06-30', timeGranularity: 'DAILY' },
        'DAILY reports cover at most 92 days',
      ],
      [
        { accountId: 1, startDate: '2026-05-01', pivots: ['MEMBER_SENIORITY', 'CAMPAIGN'] },
        'must be the only pivot',
      ],
      [{ accountId: 1, startDate: '2026-05-01', pivots: ['A', 'B'] }, 'pivots must be one of'],
      [{ accountId: 1, startDate: '2026-05-01', metrics: ['cost; drop'] }, 'metrics must be'],
      [
        {
          accountId: 1,
          startDate: '2026-05-01',
          metrics: Array.from({ length: 19 }, (_, i) => `m${i}`),
        },
        'metrics accepts 1 to 18',
      ],
    ];
    for (const [args, expected] of cases) {
      const msg = await callTool('get-ad-analytics', args);
      expect(msg.success, JSON.stringify(args)).toBe(false);
      expect(JSON.stringify(msg.error), JSON.stringify(args)).toContain(expected);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cuts an oversized report below 50,000 characters and says how to narrow it', async () => {
    const rows = Array.from({ length: 3_000 }, (_, i) => analyticsRow((i % 28) + 1, 141000000 + i));
    mockFetch(jsonResponse({ elements: rows }));
    const msg = await callTool('get-ad-analytics', {
      accountId: 1,
      startDate: '2026-05-01',
      endDate: '2026-05-28',
      timeGranularity: 'DAILY',
      pivots: ['CREATIVE'],
    });
    expect(msg.success).toBe(true);
    const result = resultOf(msg);
    expect(JSON.stringify(result).length).toBeLessThan(50_000);
    expect(result.limitApplied).toBe(true);
    expect(result.rowCount).toBeLessThan(3_000);
    expect(String(result.note)).toContain('Narrow the date range');
  });
});
