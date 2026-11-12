/**
 * Read-only tools: the GAQL each one sends, the shape it returns, size limits and
 * argument validation. The Google Ads API is mocked (fetch).
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  adsFailure,
  BUSY_METRICS,
  CUSTOMER,
  campaignRow,
  MANAGER,
  searchPage,
  sent,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch } from './harness.js';

const SEARCH_URL = `${BASE_URL}/customers/${CUSTOMER}/googleAds:search`;

describe('list-accessible-customers', () => {
  it('lists the accounts with their details and flags managers', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ resourceNames: [`customers/${CUSTOMER}`, `customers/${MANAGER}`] }),
      searchPage([
        {
          customer: {
            resourceName: `customers/${CUSTOMER}`,
            id: CUSTOMER,
            descriptiveName: 'Shop &amp; Co',
            currencyCode: 'EUR',
            timeZone: 'Europe/Madrid',
            status: 'ENABLED',
          },
        },
      ]),
      searchPage([
        {
          customer: {
            resourceName: `customers/${MANAGER}`,
            id: MANAGER,
            descriptiveName: 'Agency MCC',
            currencyCode: 'EUR',
            timeZone: 'Europe/Madrid',
            manager: true,
            status: 'ENABLED',
          },
        },
      ]),
    );
    const result = await callTool('list-accessible-customers', {});
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      customers: [
        {
          customerId: CUSTOMER,
          name: 'Shop &amp; Co',
          currency: 'EUR',
          timeZone: 'Europe/Madrid',
          manager: false,
          testAccount: false,
          status: 'ENABLED',
        },
        {
          customerId: MANAGER,
          name: 'Agency MCC',
          currency: 'EUR',
          timeZone: 'Europe/Madrid',
          manager: true,
          testAccount: false,
          status: 'ENABLED',
        },
      ],
      total: 2,
      detailsLimited: false,
    });
    const details = sent(fetchMock, 1);
    expect(details.url.href).toBe(SEARCH_URL);
    expect(details.method).toBe('POST');
    expect(details.body.query).toMatch(/^SELECT customer\.id, .* FROM customer LIMIT 1$/);
    expect(details.headers['login-customer-id']).toBeUndefined();
  });

  it('keeps going when one account cannot be read', async () => {
    mockFetch(
      jsonResponse({ resourceNames: [`customers/${CUSTOMER}`] }),
      adsFailure(403, 'PERMISSION_DENIED', [
        {
          errorCode: { authorizationError: 'CUSTOMER_NOT_ENABLED' },
          message: 'The customer account is not enabled.',
        },
      ]),
    );
    const result = await callTool('list-accessible-customers', {});
    expect(result.success).toBe(true);
    const customers = (result.result as any).customers;
    expect(customers[0].customerId).toBe(CUSTOMER);
    expect(customers[0].error).toContain('CUSTOMER_NOT_ENABLED');
  });

  it('details only the first 10 accounts', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => String(1000000000 + i));
    const fetchMock = mockFetch(
      jsonResponse({ resourceNames: ids.map((id) => `customers/${id}`) }),
    );
    fetchMock.mockImplementation(() => Promise.resolve(searchPage([{ customer: { id: '1' } }])));
    const result = await callTool('list-accessible-customers', {});
    const out = result.result as any;
    expect(out.total).toBe(12);
    expect(out.detailsLimited).toBe(true);
    expect(out.customers[11]).toEqual({ customerId: ids[11] });
    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it('returns an empty list when the user has no accounts (no resourceNames key)', async () => {
    mockFetch(jsonResponse({}));
    const result = await callTool('list-accessible-customers', {});
    expect(result.result).toEqual({ customers: [], total: 0, detailsLimited: false });
  });
});

describe('list-client-accounts', () => {
  it('queries customer_client on the manager and points at the loginCustomerId to use', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customerClient: {
            resourceName: `customers/${MANAGER}/customerClients/${CUSTOMER}`,
            id: CUSTOMER,
            descriptiveName: 'Client A',
            level: '1',
            status: 'ENABLED',
            currencyCode: 'USD',
            timeZone: 'America/New_York',
          },
        },
      ]),
    );
    const result = await callTool('list-client-accounts', { customerId: Number(MANAGER) });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      managerId: MANAGER,
      loginCustomerId: MANAGER,
      clients: [
        {
          customerId: CUSTOMER,
          name: 'Client A',
          manager: false,
          level: 1,
          status: 'ENABLED',
          currency: 'USD',
          timeZone: 'America/New_York',
          testAccount: false,
        },
      ],
      limitApplied: false,
    });
    const req = sent(fetchMock);
    expect(req.url.pathname).toBe(`/v26/customers/${MANAGER}/googleAds:search`);
    expect(req.body.query).toContain('FROM customer_client');
    expect(req.body.query).toContain('customer_client.level <= 1');
    expect(req.body.query).toContain("customer_client.status = 'ENABLED'");
    expect(req.body.query).toMatch(/LIMIT 201$/);
  });

  it('goes deeper and includes inactive accounts on request', async () => {
    const fetchMock = mockFetch(searchPage([]));
    await callTool('list-client-accounts', {
      customerId: MANAGER,
      maxLevel: 3,
      includeInactive: true,
      limit: 5,
    });
    const query = sent(fetchMock).body.query;
    expect(query).toContain('customer_client.level <= 3');
    expect(query).not.toContain('customer_client.status = ');
    expect(query).toMatch(/LIMIT 6$/);
  });

  it('rejects an out-of-range maxLevel before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-client-accounts', { customerId: MANAGER, maxLevel: 50 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-account-summary', () => {
  it('returns totals in currency units with zeros filled in', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customer: {
            resourceName: `customers/${CUSTOMER}`,
            id: CUSTOMER,
            descriptiveName: 'Shop',
            currencyCode: 'EUR',
            timeZone: 'Europe/Madrid',
            autoTaggingEnabled: true,
          },
          // conversions are 0, so Google leaves them out.
          metrics: {
            clicks: '10',
            costMicros: '12345678',
            ctr: 0.1,
            averageCpc: 1234567.8,
            impressions: '100',
          },
        },
      ]),
    );
    const result = await callTool('get-account-summary', {
      customerId: '123-456-7890',
      dateRange: 'last_7_days',
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      customerId: CUSTOMER,
      name: 'Shop',
      currency: 'EUR',
      timeZone: 'Europe/Madrid',
      manager: false,
      testAccount: false,
      autoTaggingEnabled: true,
      dateRange: { preset: 'LAST_7_DAYS' },
      metrics: {
        impressions: 100,
        clicks: 10,
        ctr: 0.1,
        averageCpc: 1.23,
        cost: 12.35,
        conversions: 0,
        conversionsValue: 0,
        costPerConversion: null,
      },
    });
    const req = sent(fetchMock);
    expect(req.url.href).toBe(SEARCH_URL);
    expect(req.body.query).toContain('FROM customer WHERE segments.date DURING LAST_7_DAYS');
  });

  it('falls back to the account details when the range had no activity', async () => {
    const fetchMock = mockFetch(
      searchPage([]),
      searchPage([{ customer: { id: CUSTOMER, descriptiveName: 'Quiet', currencyCode: 'GBP' } }]),
    );
    const result = await callTool('get-account-summary', {
      customerId: CUSTOMER,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    });
    const out = result.result as any;
    expect(out.name).toBe('Quiet');
    expect(out.metrics.impressions).toBe(0);
    expect(out.dateRange).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(sent(fetchMock, 0).body.query).toContain(
      "segments.date BETWEEN '2026-01-01' AND '2026-01-31'",
    );
    expect(sent(fetchMock, 1).body.query).not.toContain('metrics');
  });

  it('explains that manager accounts have no metrics', async () => {
    mockFetch(
      adsFailure(400, 'INVALID_ARGUMENT', [
        {
          errorCode: { queryError: 'REQUESTED_METRICS_FOR_MANAGER' },
          message: 'Metrics cannot be requested for a manager account.',
        },
      ]),
    );
    const result = await callTool('get-account-summary', { customerId: MANAGER });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('list-client-accounts');
  });

  it.each([
    [{ customerId: '12345' }, 'customerId'],
    [{ customerId: '123/../456' }, 'customerId'],
    [{ customerId: CUSTOMER, startDate: '2026-01-01' }, 'both startDate and endDate'],
    [{ customerId: CUSTOMER, startDate: '2026-02-30', endDate: '2026-03-01' }, 'YYYY-MM-DD'],
    [{ customerId: CUSTOMER, startDate: '2026-03-01', endDate: '2026-02-01' }, 'after endDate'],
    [{ customerId: CUSTOMER, dateRange: 'LAST_YEAR' }, 'dateRange must be one of'],
    [{ customerId: CUSTOMER, loginCustomerId: 'abc' }, 'loginCustomerId'],
  ])('rejects %j before any request', async (args, text) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-account-summary', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(text);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('run-gaql-query', () => {
  it('sends the query and page token and returns the raw rows', async () => {
    const rows = [campaignRow('20123456789', 'Brand', BUSY_METRICS)];
    const fetchMock = mockFetch(searchPage(rows, { nextPageToken: 'next-page-token' }));
    const query = 'SELECT campaign.name, metrics.clicks FROM campaign LIMIT 10';
    const result = await callTool('run-gaql-query', {
      customerId: CUSTOMER,
      query,
      pageToken: 'page-2',
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      results: rows,
      rowCount: 1,
      fieldMask: 'synthetic.fieldMask',
      nextPageToken: 'next-page-token',
      limitApplied: false,
    });
    expect(sent(fetchMock).body).toEqual({ query, pageToken: 'page-2' });
  });

  it('cuts an oversized page under 50,000 characters and drops the page token', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      campaignRow(String(20000000000 + i), `Campaign number ${i} with a long name`, BUSY_METRICS),
    );
    mockFetch(searchPage(rows, { nextPageToken: 'next' }));
    const result = await callTool('run-gaql-query', {
      customerId: CUSTOMER,
      query: 'SELECT campaign.name FROM campaign',
    });
    const out = result.result as any;
    expect(JSON.stringify(out).length).toBeLessThan(50_000);
    expect(out.limitApplied).toBe(true);
    expect(out.nextPageToken).toBeNull();
    expect(out.note).toContain('LIMIT');
  });

  it('rejects anything that is not a SELECT, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('run-gaql-query', {
      customerId: CUSTOMER,
      query: 'DELETE campaign',
    });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes query errors through with their code', async () => {
    mockFetch(
      adsFailure(400, 'INVALID_ARGUMENT', [
        {
          errorCode: { queryError: 'UNRECOGNIZED_FIELD' },
          message: "Unrecognized field in the query: 'campaign.nope'.",
        },
      ]),
    );
    const result = await callTool('run-gaql-query', {
      customerId: CUSTOMER,
      query: 'SELECT campaign.nope FROM campaign',
    });
    expect(JSON.stringify(result.error)).toContain('queryError.UNRECOGNIZED_FIELD');
  });
});

describe('list-campaigns', () => {
  it('lists campaigns with their budget in currency units', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
          campaign: {
            resourceName: `customers/${CUSTOMER}/campaigns/20123456789`,
            status: 'PAUSED',
            servingStatus: 'SERVING',
            primaryStatus: 'PAUSED',
            advertisingChannelType: 'SEARCH',
            biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
            name: 'Brand',
            id: '20123456789',
            startDateTime: '2026-01-05 00:00:00',
            endDateTime: '2037-12-30 23:59:59',
          },
          campaignBudget: {
            resourceName: `customers/${CUSTOMER}/campaignBudgets/13579`,
            id: '13579',
            amountMicros: '25000000',
          },
        },
      ]),
    );
    const result = await callTool('list-campaigns', { customerId: CUSTOMER, status: 'paused' });
    expect(result.result).toEqual({
      currency: 'EUR',
      campaigns: [
        {
          campaignId: '20123456789',
          name: 'Brand',
          status: 'PAUSED',
          servingStatus: 'SERVING',
          primaryStatus: 'PAUSED',
          channelType: 'SEARCH',
          biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
          startDateTime: '2026-01-05 00:00:00',
          endDateTime: '2037-12-30 23:59:59',
          budgetId: '13579',
          dailyBudget: 25,
        },
      ],
      limitApplied: false,
    });
    const query = sent(fetchMock).body.query;
    expect(query).toContain("WHERE campaign.status = 'PAUSED'");
    expect(query).toMatch(/LIMIT 101$/);
  });

  it('flags limitApplied when there are more campaigns than the limit', async () => {
    mockFetch(searchPage([campaignRow('1', 'a'), campaignRow('2', 'b'), campaignRow('3', 'c')]));
    const result = await callTool('list-campaigns', { customerId: CUSTOMER, limit: 2 });
    const out = result.result as any;
    expect(out.campaigns).toHaveLength(2);
    expect(out.limitApplied).toBe(true);
  });

  it('excludes removed campaigns by default', async () => {
    const fetchMock = mockFetch(searchPage([]));
    await callTool('list-campaigns', { customerId: CUSTOMER });
    expect(sent(fetchMock).body.query).toContain("WHERE campaign.status != 'REMOVED'");
  });
});

describe('list-campaign-budgets', () => {
  it('lists budgets and flags shared ones', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
          campaignBudget: {
            resourceName: `customers/${CUSTOMER}/campaignBudgets/13579`,
            id: '13579',
            name: 'Shared search budget',
            amountMicros: '40000000',
            status: 'ENABLED',
            deliveryMethod: 'STANDARD',
            explicitlyShared: true,
            referenceCount: '3',
            period: 'DAILY',
          },
        },
      ]),
    );
    const result = await callTool('list-campaign-budgets', { customerId: CUSTOMER });
    expect(result.result).toEqual({
      currency: 'EUR',
      budgets: [
        {
          budgetId: '13579',
          name: 'Shared search budget',
          amount: 40,
          period: 'DAILY',
          deliveryMethod: 'STANDARD',
          shared: true,
          campaignCount: 3,
          status: 'ENABLED',
        },
      ],
      limitApplied: false,
    });
    expect(sent(fetchMock).body.query).toContain(
      "FROM campaign_budget WHERE campaign_budget.status != 'REMOVED'",
    );
  });
});

describe('get-performance-report', () => {
  it('reports campaigns by cost with metrics in currency units', async () => {
    const fetchMock = mockFetch(
      searchPage([
        campaignRow('20123456789', 'Brand', BUSY_METRICS),
        // No traffic-free row here: Google leaves zero metrics out, so metrics can be partial.
        campaignRow('20123456790', 'Generic', { impressions: '7' }),
      ]),
    );
    const result = await callTool('get-performance-report', {
      customerId: CUSTOMER,
      dateRange: 'LAST_MONTH',
    });
    expect(result.success).toBe(true);
    const out = result.result as any;
    expect(out.level).toBe('CAMPAIGN');
    expect(out.currency).toBe('EUR');
    expect(out.rows[0]).toEqual({
      campaignId: '20123456789',
      campaignName: 'Brand',
      status: 'ENABLED',
      channelType: 'SEARCH',
      impressions: 2483,
      clicks: 152,
      ctr: 0.0612,
      averageCpc: 0.55,
      cost: 84.32,
      conversions: 12.5,
      conversionsValue: 1250.75,
      costPerConversion: 6.75,
    });
    expect(out.rows[1]).toMatchObject({
      impressions: 7,
      clicks: 0,
      cost: 0,
      costPerConversion: null,
    });
    const query = sent(fetchMock).body.query;
    expect(query).toMatch(
      /^SELECT campaign\.id, .* FROM campaign WHERE segments\.date DURING LAST_MONTH AND campaign\.status != 'REMOVED' ORDER BY metrics\.cost_micros DESC LIMIT 51$/,
    );
  });

  it('builds a keyword report filtered by ad group, per day, ordered by clicks', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'USD' },
          campaign: {
            resourceName: `customers/${CUSTOMER}/campaigns/111`,
            name: 'Generic',
            id: '111',
          },
          adGroup: { resourceName: `customers/${CUSTOMER}/adGroups/222`, id: '222', name: 'Shoes' },
          adGroupCriterion: {
            resourceName: `customers/${CUSTOMER}/adGroupCriteria/222~333`,
            status: 'ENABLED',
            keyword: { text: 'running shoes', matchType: 'PHRASE' },
            qualityInfo: { qualityScore: 7 },
            criterionId: '333',
          },
          metrics: {
            clicks: '3',
            impressions: '40',
            costMicros: '1500000',
            ctr: 0.075,
            averageCpc: 500000,
          },
          segments: { date: '2026-10-01' },
          keywordView: { resourceName: `customers/${CUSTOMER}/keywordViews/222~333` },
        },
      ]),
    );
    const result = await callTool('get-performance-report', {
      customerId: CUSTOMER,
      level: 'keyword',
      adGroupId: 222,
      segmentByDate: true,
      orderBy: 'CLICKS',
    });
    const out = result.result as any;
    expect(out.rows[0]).toMatchObject({
      campaignId: '111',
      adGroupId: '222',
      adGroupName: 'Shoes',
      criterionId: '333',
      keyword: 'running shoes',
      matchType: 'PHRASE',
      qualityScore: 7,
      date: '2026-10-01',
      clicks: 3,
      cost: 1.5,
    });
    const query = sent(fetchMock).body.query;
    expect(query).toContain('FROM keyword_view');
    expect(query).toContain('segments.date FROM keyword_view');
    expect(query).toContain('ad_group.id = 222');
    expect(query).toContain('ad_group_criterion.negative = FALSE');
    expect(query).toContain('ORDER BY metrics.clicks DESC');
  });

  it('reports ads with their first headlines and approval status', async () => {
    mockFetch(
      searchPage([
        {
          customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
          campaign: {
            resourceName: `customers/${CUSTOMER}/campaigns/111`,
            name: 'Generic',
            id: '111',
          },
          adGroup: { resourceName: `customers/${CUSTOMER}/adGroups/222`, id: '222', name: 'Shoes' },
          adGroupAd: {
            resourceName: `customers/${CUSTOMER}/adGroupAds/222~444`,
            status: 'ENABLED',
            ad: {
              resourceName: `customers/${CUSTOMER}/ads/444`,
              id: '444',
              finalUrls: ['https://shop.example.com/shoes'],
              type: 'RESPONSIVE_SEARCH_AD',
              responsiveSearchAd: {
                headlines: [
                  { text: 'Running Shoes', pinnedField: 'HEADLINE_1' },
                  { text: 'Free Returns' },
                  { text: 'Shop Now' },
                  { text: 'Fourth headline' },
                ],
              },
            },
            policySummary: { approvalStatus: 'APPROVED' },
          },
          metrics: { impressions: '50' },
        },
      ]),
    );
    const result = await callTool('get-performance-report', { customerId: CUSTOMER, level: 'AD' });
    expect((result.result as any).rows[0]).toMatchObject({
      adId: '444',
      adType: 'RESPONSIVE_SEARCH_AD',
      approvalStatus: 'APPROVED',
      finalUrl: 'https://shop.example.com/shoes',
      headlines: ['Running Shoes', 'Free Returns', 'Shop Now'],
      impressions: 50,
    });
  });

  it('filters ad groups by campaign', async () => {
    const fetchMock = mockFetch(searchPage([]));
    const result = await callTool('get-performance-report', {
      customerId: CUSTOMER,
      level: 'AD_GROUP',
      campaignId: '20123456789',
    });
    expect((result.result as any).rows).toEqual([]);
    const query = sent(fetchMock).body.query;
    expect(query).toContain('FROM ad_group');
    expect(query).toContain('campaign.id = 20123456789');
  });

  it('stays under 50,000 characters for a large report', async () => {
    const rows = Array.from({ length: 501 }, (_, i) =>
      campaignRow(String(20000000000 + i), `Campaign ${'x'.repeat(80)} ${i}`, BUSY_METRICS),
    );
    mockFetch(searchPage(rows));
    const result = await callTool('get-performance-report', { customerId: CUSTOMER, limit: 500 });
    const out = result.result as any;
    expect(JSON.stringify(out).length).toBeLessThan(50_000);
    expect(out.limitApplied).toBe(true);
  });

  it.each([
    [{ customerId: CUSTOMER, level: 'CAMPAIGN', adGroupId: 1 }, 'adGroupId cannot filter'],
    [{ customerId: CUSTOMER, campaignId: '1 OR 1=1' }, 'campaignId must be a numeric ID'],
    [{ customerId: CUSTOMER, campaignId: 2 ** 60 }, 'JSON object'],
    [{ customerId: CUSTOMER, level: 'GEO' }, 'level must be one of'],
    [{ customerId: CUSTOMER, limit: 501 }, 'limit must be an integer'],
  ])('rejects %j before any request', async (args, text) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-performance-report', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(text);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-search-terms-report', () => {
  it('returns search terms with the matched keyword', async () => {
    const fetchMock = mockFetch(
      searchPage([
        {
          customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
          campaign: {
            resourceName: `customers/${CUSTOMER}/campaigns/111`,
            name: 'Generic',
            id: '111',
          },
          adGroup: { resourceName: `customers/${CUSTOMER}/adGroups/222`, id: '222', name: 'Shoes' },
          metrics: {
            clicks: '9',
            costMicros: '7200000',
            ctr: 0.09,
            averageCpc: 800000,
            impressions: '100',
          },
          searchTermView: {
            resourceName: `customers/${CUSTOMER}/searchTermViews/111~222~ZnJlZSBzaG9lcw`,
            searchTerm: 'free shoes',
            status: 'NONE',
          },
          segments: {
            keyword: {
              adGroupCriterion: `customers/${CUSTOMER}/adGroupCriteria/222~333`,
              info: { text: 'shoes', matchType: 'BROAD' },
            },
          },
        },
      ]),
    );
    const result = await callTool('get-search-terms-report', {
      customerId: CUSTOMER,
      campaignId: 111,
      minClicks: 5,
    });
    expect(result.success).toBe(true);
    expect((result.result as any).rows[0]).toEqual({
      searchTerm: 'free shoes',
      status: 'NONE',
      campaignId: '111',
      campaignName: 'Generic',
      adGroupId: '222',
      adGroupName: 'Shoes',
      keyword: 'shoes',
      matchType: 'BROAD',
      impressions: 100,
      clicks: 9,
      ctr: 0.09,
      averageCpc: 0.8,
      cost: 7.2,
      conversions: 0,
      conversionsValue: 0,
      costPerConversion: null,
    });
    const query = sent(fetchMock).body.query;
    expect(query).toContain('FROM search_term_view');
    expect(query).toContain('campaign.id = 111');
    expect(query).toContain('metrics.clicks >= 5');
    expect(query).toMatch(/LIMIT 101$/);
  });

  it('rejects a negative minClicks before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-search-terms-report', {
      customerId: CUSTOMER,
      minClicks: -1,
    });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
