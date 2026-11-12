/**
 * Tool, client and health tests for the TikTok Ads Agent App. The API is mocked (fetch).
 *
 * Mock bodies follow the TikTok API for Business v1.3 shapes with synthetic values: every
 * answer is HTTP 200 with `{ code, message, request_id, data }`, ids are strings (they
 * exceed Number.MAX_SAFE_INTEGER), report metrics are strings, and responses carry fields
 * the tools drop.
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  callTool,
  installationSecrets,
  jsonResponse,
  mockFetch,
  requestOf,
  runHealthCheck,
  systemSecrets,
} from './harness.js';

const ADVERTISER = '7012345678901234567';
const CAMPAIGN = '1800000000000000001';
const ADGROUP = '1800000000000000101';
const AD = '1800000000000000201';

/** A successful TikTok envelope. */
const ok = (data: unknown) =>
  jsonResponse({ code: 0, message: 'OK', request_id: '20261017000000ABCDEF', data });
/** A TikTok error: HTTP 200 with a non-zero code. */
const tiktokError = (code: number, message: string) =>
  jsonResponse({ code, message, request_id: '20261017000000ERROR1', data: {} });

const pageInfo = (total: number, page = 1, pageSize = 50) => ({
  page,
  page_size: pageSize,
  total_number: total,
  total_page: Math.ceil(total / pageSize),
});

const errorOf = (result: Record<string, unknown>) => JSON.stringify(result.error);
/** What the agentapps CLI sends for `key:<long id>`: a number, already rounded. */
const cliNumber = (digits: string) => Number(digits);

describe('health', () => {
  it('reports ready when the advertiser list answers, sending token and app credentials', async () => {
    const fetchMock = mockFetch(ok({ list: [] }));
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    const { url, init } = requestOf(fetchMock);
    expect(url.origin + url.pathname).toBe(`${BASE_URL}/oauth2/advertiser/get/`);
    expect(url.searchParams.get('app_id')).toBe(systemSecrets.TIKTOK_APP_ID);
    expect(url.searchParams.get('secret')).toBe(systemSecrets.TIKTOK_APP_SECRET);
    expect((init.headers as Record<string, string>)['Access-Token']).toBe(
      installationSecrets.TIKTOK_ACCESS_TOKEN,
    );
  });

  it('reports degraded and names the host when the API is unreachable', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      ),
    );
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain(new URL(BASE_URL).host);
  });

  it('reports not_ready with MISSING_SECRET when the access token is missing', async () => {
    delete installationSecrets.TIKTOK_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(JSON.stringify(health.issues)).toContain('MISSING_SECRET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports degraded, not failed, when only the app credentials are missing', async () => {
    delete systemSecrets.TIKTOK_APP_SECRET;
    const fetchMock = mockFetch();
    const health = await runHealthCheck();
    expect(health.status).toBe('degraded');
    expect(String(health.message)).toContain('agentapps config app.tiktok-ads TIKTOK_APP_SECRET');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not_ready when TikTok rejects the token', async () => {
    mockFetch(tiktokError(40105, 'Access token is incorrect or has been revoked.'));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(String(health.message)).toContain('[AUTH_REQUIRED]');
  });
});

describe('client', () => {
  it('maps TikTok envelope codes to actionable errors', async () => {
    const cases: Array<[number, string]> = [
      [40100, '[RATE_LIMITED]'],
      [40104, '[AUTH_REQUIRED]'],
      [40001, '[FORBIDDEN]'],
      [40002, '[BAD_REQUEST]'],
      [50000, '[TIKTOK_ADS_ERROR]'],
    ];
    for (const [code, prefix] of cases) {
      mockFetch(tiktokError(code, `message for ${code}`));
      const result = await callTool('list-campaigns', { advertiserId: ADVERTISER });
      expect(result.success, String(code)).toBe(false);
      expect(errorOf(result)).toContain(prefix);
      expect(errorOf(result)).toContain(`message for ${code}`);
      expect(errorOf(result)).toContain('request_id 20261017000000ERROR1');
    }
  });

  it('retries a GET once on 503 and returns the second answer', async () => {
    const fetchMock = mockFetch(
      jsonResponse({}, 503, { 'Retry-After': '0' }),
      ok({ list: [], page_info: pageInfo(0) }),
    );
    const result = await callTool('list-campaigns', { advertiserId: ADVERTISER });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries a POST', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 503, { 'Retry-After': '0' }));
    const result = await callTool('pause-delivery', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      ids: [CAMPAIGN],
    });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps a long error body and reports the status', async () => {
    mockFetch(new Response('x'.repeat(10_000), { status: 500, statusText: 'Server Error' }));
    const result = await callTool('list-campaigns', { advertiserId: ADVERTISER });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('500');
    expect(errorOf(result).length).toBeLessThan(3_000);
  });

  it('reports a non-JSON answer clearly', async () => {
    mockFetch(new Response('<html>gateway</html>', { status: 200 }));
    const result = await callTool('list-campaigns', { advertiserId: ADVERTISER });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('not JSON');
  });

  it('never puts a secret value in an error message', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockImplementation(() =>
      Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }),
      ),
    );
    const results = [
      await callTool('list-advertisers', {}),
      await callTool('list-campaigns', { advertiserId: ADVERTISER }),
    ];
    for (const result of results) {
      expect(result.success).toBe(false);
      expect(errorOf(result)).toContain('business-api.tiktok.com');
      for (const value of [
        ...Object.values(installationSecrets),
        systemSecrets.TIKTOK_APP_SECRET,
      ]) {
        expect(JSON.stringify(result)).not.toContain(value);
      }
    }
  });

  it('asks for the access token when it is missing, before any request', async () => {
    delete installationSecrets.TIKTOK_ACCESS_TOKEN;
    const fetchMock = mockFetch();
    const result = await callTool('get-report', {
      advertiserId: ADVERTISER,
      startDate: '2026-10-01',
      endDate: '2026-10-07',
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('TIKTOK_ACCESS_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-advertisers', () => {
  it('sends the app credentials and returns ids as strings', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [
          { advertiser_id: ADVERTISER, advertiser_name: 'Acme Shop' },
          { advertiser_id: '7012345678901234568', advertiser_name: 'Acme Outlet' },
        ],
      }),
    );
    const result = await callTool('list-advertisers', {});
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      advertisers: [
        { advertiserId: ADVERTISER, name: 'Acme Shop' },
        { advertiserId: '7012345678901234568', name: 'Acme Outlet' },
      ],
      count: 2,
    });
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/oauth2/advertiser/get/');
    expect(init.method).toBe('GET');
    expect(url.searchParams.get('app_id')).toBe('7100000000000000001');
  });

  it('explains how to set the app credentials when they are missing', async () => {
    delete systemSecrets.TIKTOK_APP_ID;
    const fetchMock = mockFetch();
    const result = await callTool('list-advertisers', {});
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[SYSTEM_CONFIG_MISSING]');
    expect(errorOf(result)).toContain('agentapps config app.tiktok-ads TIKTOK_APP_ID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays under the result limit for a huge agency account', async () => {
    const list = Array.from({ length: 2_000 }, (_, i) => ({
      advertiser_id: String(7012345678901230000n + BigInt(i)),
      advertiser_name: `Client account number ${i} with a fairly long name`,
    }));
    mockFetch(ok({ list }));
    const result = await callTool('list-advertisers', {});
    expect(result.success).toBe(true);
    const body = result.result as Record<string, unknown>;
    expect(JSON.stringify(body).length).toBeLessThan(50_000);
    expect(body.limitApplied).toBe(true);
    expect(body.count).toBe(2_000);
  });
});

describe('get-advertiser-info', () => {
  it('sends advertiser_ids as a JSON array and drops contact details', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [
          {
            advertiser_id: ADVERTISER,
            name: 'Acme Shop',
            status: 'STATUS_ENABLE',
            currency: 'EUR',
            timezone: 'Etc/GMT-2',
            display_timezone: 'Europe/Madrid',
            balance: 1234.56,
            company: 'Acme SL',
            country: 'ES',
            role: 'ROLE_ADVERTISER',
            create_time: 1700000000,
            email: 'owner@example.com',
            address: 'Calle Falsa 123',
            telephone_number: '+34000000000',
          },
        ],
      }),
    );
    const result = await callTool('get-advertiser-info', { advertiserIds: [ADVERTISER] });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      advertisers: [
        {
          advertiserId: ADVERTISER,
          name: 'Acme Shop',
          status: 'STATUS_ENABLE',
          currency: 'EUR',
          timezone: 'Etc/GMT-2',
          displayTimezone: 'Europe/Madrid',
          balance: 1234.56,
          company: 'Acme SL',
          country: 'ES',
          role: 'ROLE_ADVERTISER',
          createTime: 1700000000,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('owner@example.com');
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/advertiser/info/');
    expect(url.searchParams.get('advertiser_ids')).toBe(JSON.stringify([ADVERTISER]));
  });

  it('rejects an id the CLI already rounded, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('get-advertiser-info', {
      advertiserIds: [cliNumber('7012345678901234567')],
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('rounded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects more than 100 ids', async () => {
    const fetchMock = mockFetch();
    const ids = Array.from({ length: 101 }, (_, i) => String(1000 + i));
    const result = await callTool('get-advertiser-info', { advertiserIds: ids });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const rawCampaign = (id: string, extra: Record<string, unknown> = {}) => ({
  advertiser_id: ADVERTISER,
  campaign_id: id,
  campaign_name: 'Spring sale',
  objective_type: 'TRAFFIC',
  operation_status: 'ENABLE',
  secondary_status: 'CAMPAIGN_STATUS_ENABLE',
  budget: 100,
  budget_mode: 'BUDGET_MODE_DAY',
  create_time: '2026-03-01 10:00:00',
  modify_time: '2026-03-02 11:30:00',
  is_new_structure: true,
  is_smart_performance_campaign: false,
  rf_campaign_type: 'STANDARD',
  ...extra,
});

describe('list-campaigns', () => {
  it('sends filtering as JSON and returns curated campaigns with paging', async () => {
    const fetchMock = mockFetch(
      ok({ list: [rawCampaign(CAMPAIGN)], page_info: pageInfo(120, 2, 50) }),
    );
    const result = await callTool('list-campaigns', {
      advertiserId: ADVERTISER,
      campaignIds: [CAMPAIGN],
      status: 'STATUS_DELIVERY_OK',
      nameContains: 'Spring',
      page: 2,
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      campaigns: [
        {
          campaignId: CAMPAIGN,
          name: 'Spring sale',
          objectiveType: 'TRAFFIC',
          operationStatus: 'ENABLE',
          secondaryStatus: 'CAMPAIGN_STATUS_ENABLE',
          budget: 100,
          budgetMode: 'BUDGET_MODE_DAY',
          createTime: '2026-03-01 10:00:00',
          modifyTime: '2026-03-02 11:30:00',
        },
      ],
      page: 2,
      pageSize: 50,
      totalNumber: 120,
      totalPage: 3,
      hasMore: true,
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(url.pathname).toBe('/open_api/v1.3/campaign/get/');
    expect(url.searchParams.get('advertiser_id')).toBe(ADVERTISER);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('page_size')).toBe('50');
    expect(JSON.parse(url.searchParams.get('filtering') ?? '')).toEqual({
      campaign_ids: [CAMPAIGN],
      campaign_name: 'Spring',
      primary_status: 'STATUS_DELIVERY_OK',
    });
  });

  it('defaults to everything not deleted', async () => {
    const fetchMock = mockFetch(ok({ list: [], page_info: pageInfo(0) }));
    const result = await callTool('list-campaigns', { advertiserId: ADVERTISER });
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).hasMore).toBe(false);
    expect(JSON.parse(requestOf(fetchMock).url.searchParams.get('filtering') ?? '')).toEqual({
      primary_status: 'STATUS_NOT_DELETE',
    });
  });

  it('rejects a bad advertiser id, status or page size before any request', async () => {
    const fetchMock = mockFetch();
    for (const args of [
      { advertiserId: '../7012' },
      { advertiserId: cliNumber('7012345678901234567') },
      { advertiserId: ADVERTISER, status: 'RUNNING' },
      { advertiserId: ADVERTISER, pageSize: 1000 },
      {},
    ]) {
      const result = await callTool('list-campaigns', args);
      expect(result.success, JSON.stringify(args)).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a small numeric id, as the CLI sends it', async () => {
    const fetchMock = mockFetch(ok({ list: [], page_info: pageInfo(0) }));
    const result = await callTool('list-campaigns', { advertiserId: 123456 });
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock).url.searchParams.get('advertiser_id')).toBe('123456');
  });

  it('stops adding items before the result limit', async () => {
    const list = Array.from({ length: 100 }, (_, i) =>
      rawCampaign(String(1800000000000000000n + BigInt(i)), { campaign_name: 'n'.repeat(512) }),
    );
    mockFetch(ok({ list, page_info: pageInfo(100, 1, 100) }));
    const result = await callTool('list-campaigns', { advertiserId: ADVERTISER, pageSize: 100 });
    expect(result.success).toBe(true);
    const body = result.result as Record<string, unknown>;
    expect(JSON.stringify(body).length).toBeLessThan(50_000);
    expect(body.limitApplied).toBe(true);
    expect(String(body.note)).toContain('pageSize');
  });
});

describe('list-ad-groups', () => {
  it('filters by campaign and returns curated ad groups', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [
          {
            advertiser_id: ADVERTISER,
            campaign_id: CAMPAIGN,
            adgroup_id: ADGROUP,
            adgroup_name: 'ES 18-34',
            operation_status: 'DISABLE',
            secondary_status: 'ADGROUP_STATUS_DISABLE',
            budget: 20.5,
            budget_mode: 'BUDGET_MODE_DAY',
            optimization_goal: 'CLICK',
            bid_type: 'BID_TYPE_NO_BID',
            bid_price: 0,
            billing_event: 'CPC',
            schedule_start_time: '2026-03-01 00:00:00',
            schedule_end_time: '2026-12-31 23:59:59',
            create_time: '2026-03-01 10:00:00',
            modify_time: '2026-03-01 10:00:00',
            location_ids: ['2510769'],
            age_groups: ['AGE_18_24', 'AGE_25_34'],
            pixel_id: null,
          },
        ],
        page_info: pageInfo(1),
      }),
    );
    const result = await callTool('list-ad-groups', {
      advertiserId: ADVERTISER,
      campaignIds: [CAMPAIGN],
    });
    expect(result.success).toBe(true);
    expect((result.result as { adGroups: unknown[] }).adGroups).toEqual([
      {
        adgroupId: ADGROUP,
        name: 'ES 18-34',
        campaignId: CAMPAIGN,
        operationStatus: 'DISABLE',
        secondaryStatus: 'ADGROUP_STATUS_DISABLE',
        budget: 20.5,
        budgetMode: 'BUDGET_MODE_DAY',
        optimizationGoal: 'CLICK',
        bidType: 'BID_TYPE_NO_BID',
        bidPrice: 0,
        billingEvent: 'CPC',
        scheduleStartTime: '2026-03-01 00:00:00',
        scheduleEndTime: '2026-12-31 23:59:59',
        createTime: '2026-03-01 10:00:00',
        modifyTime: '2026-03-01 10:00:00',
      },
    ]);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/adgroup/get/');
    expect(JSON.parse(url.searchParams.get('filtering') ?? '')).toEqual({
      campaign_ids: [CAMPAIGN],
      primary_status: 'STATUS_NOT_DELETE',
    });
  });

  it('rejects a rounded campaign id before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-ad-groups', {
      advertiserId: ADVERTISER,
      campaignIds: [cliNumber('1800000000000000001')],
    });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a TikTok permission error', async () => {
    mockFetch(tiktokError(40001, 'No permission to operate advertiser.'));
    const result = await callTool('list-ad-groups', { advertiserId: ADVERTISER });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[FORBIDDEN]');
  });
});

describe('list-ads', () => {
  it('filters by ad group and ad ids and returns curated ads', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [
          {
            advertiser_id: ADVERTISER,
            campaign_id: CAMPAIGN,
            adgroup_id: ADGROUP,
            ad_id: AD,
            ad_name: 'Video A &amp; B',
            operation_status: 'ENABLE',
            secondary_status: 'AD_STATUS_DELIVERY_OK',
            ad_format: 'SINGLE_VIDEO',
            ad_text: 'Spring is here',
            landing_page_url: 'https://shop.example.com/spring',
            create_time: '2026-03-01 10:00:00',
            modify_time: '2026-03-01 10:00:00',
            video_id: 'v10033g50000example',
            image_ids: [],
            call_to_action_id: null,
          },
        ],
        page_info: pageInfo(1),
      }),
    );
    const result = await callTool('list-ads', {
      advertiserId: ADVERTISER,
      adgroupIds: [ADGROUP],
      adIds: AD,
    });
    expect(result.success).toBe(true);
    expect((result.result as { ads: unknown[] }).ads).toEqual([
      {
        adId: AD,
        name: 'Video A &amp; B',
        adgroupId: ADGROUP,
        campaignId: CAMPAIGN,
        operationStatus: 'ENABLE',
        secondaryStatus: 'AD_STATUS_DELIVERY_OK',
        adFormat: 'SINGLE_VIDEO',
        adText: 'Spring is here',
        landingPageUrl: 'https://shop.example.com/spring',
        createTime: '2026-03-01 10:00:00',
        modifyTime: '2026-03-01 10:00:00',
      },
    ]);
    const { url } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/ad/get/');
    expect(JSON.parse(url.searchParams.get('filtering') ?? '')).toEqual({
      adgroup_ids: [ADGROUP],
      ad_ids: [AD],
      primary_status: 'STATUS_NOT_DELETE',
    });
  });

  it('rejects an invalid ad id before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-ads', { advertiserId: ADVERTISER, adIds: ['abc'] });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-report', () => {
  const reportRow = (day: string, spend: string, extra: Record<string, unknown> = {}) => ({
    dimensions: { campaign_id: CAMPAIGN, stat_time_day: `${day} 00:00:00` },
    metrics: {
      spend,
      impressions: '1000',
      clicks: '20',
      ctr: '2.00',
      campaign_name: '2026',
      cost_per_conversion: '-',
      ...extra,
    },
  });

  it('sends the report query and returns columns and numeric rows', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [reportRow('2026-10-01', '12.34'), reportRow('2026-10-02', '0.00')],
        page_info: pageInfo(2, 1, 100),
        total_metrics: { spend: '12.34', impressions: '2000' },
      }),
    );
    const result = await callTool('get-report', {
      advertiserId: ADVERTISER,
      dataLevel: 'AUCTION_CAMPAIGN',
      dimensions: ['campaign_id', 'stat_time_day'],
      metrics: ['spend', 'impressions', 'clicks', 'ctr', 'campaign_name', 'cost_per_conversion'],
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      filters: [{ fieldName: 'campaign_ids', filterType: 'IN', filterValue: [CAMPAIGN] }],
      orderField: 'spend',
      includeTotals: true,
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      reportType: 'BASIC',
      dataLevel: 'AUCTION_CAMPAIGN',
      startDate: '2026-10-01',
      endDate: '2026-10-07',
      columns: [
        'campaign_id',
        'stat_time_day',
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'campaign_name',
        'cost_per_conversion',
      ],
      rows: [
        [CAMPAIGN, '2026-10-01 00:00:00', 12.34, 1000, 20, 2, '2026', null],
        [CAMPAIGN, '2026-10-02 00:00:00', 0, 1000, 20, 2, '2026', null],
      ],
      page: 1,
      pageSize: 100,
      totalNumber: 2,
      totalPage: 1,
      hasMore: false,
      totals: { spend: 12.34, impressions: 2000 },
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(url.pathname).toBe('/open_api/v1.3/report/integrated/get/');
    const q = Object.fromEntries(url.searchParams);
    expect(q).toEqual({
      advertiser_id: ADVERTISER,
      service_type: 'AUCTION',
      report_type: 'BASIC',
      data_level: 'AUCTION_CAMPAIGN',
      dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
      metrics: JSON.stringify([
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'campaign_name',
        'cost_per_conversion',
      ]),
      start_date: '2026-10-01',
      end_date: '2026-10-07',
      filtering: JSON.stringify([
        { field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([CAMPAIGN]) },
      ]),
      order_field: 'spend',
      order_type: 'DESC',
      enable_total_metrics: 'true',
      page: '1',
      page_size: '100',
    });
  });

  it('uses the level id and default metrics when none are given', async () => {
    const fetchMock = mockFetch(ok({ list: [], page_info: pageInfo(0) }));
    const result = await callTool('get-report', {
      advertiserId: ADVERTISER,
      dataLevel: 'AUCTION_AD',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    });
    expect(result.success).toBe(true);
    const q = requestOf(fetchMock).url.searchParams;
    expect(q.get('dimensions')).toBe(JSON.stringify(['ad_id']));
    expect(JSON.parse(q.get('metrics') ?? '[]')).toContain('spend');
  });

  it('supports lifetime reports without dates', async () => {
    const fetchMock = mockFetch(ok({ list: [], page_info: pageInfo(0) }));
    const result = await callTool('get-report', { advertiserId: ADVERTISER, lifetime: true });
    expect(result.success).toBe(true);
    const q = requestOf(fetchMock).url.searchParams;
    expect(q.get('query_lifetime')).toBe('true');
    expect(q.has('start_date')).toBe(false);
  });

  it('rejects bad dates, ranges and names before any request', async () => {
    const fetchMock = mockFetch();
    const base = { advertiserId: ADVERTISER, startDate: '2026-10-01', endDate: '2026-10-07' };
    for (const args of [
      { advertiserId: ADVERTISER },
      { ...base, startDate: '01/10/2026' },
      { ...base, endDate: '2026-02-30' },
      { ...base, endDate: '2026-09-30' },
      { ...base, startDate: '2025-01-01', endDate: '2026-10-07' },
      { ...base, metrics: ['spend; drop'] },
      { ...base, dimensions: ['a', 'b', 'c', 'd', 'e'] },
      { ...base, reportType: 'GMV' },
      { ...base, filters: [{ fieldName: 'campaign_ids', filterType: 'LIKE', filterValue: 'x' }] },
      {
        ...base,
        filters: [
          {
            fieldName: 'campaign_ids',
            filterType: 'IN',
            filterValue: [cliNumber('1800000000000000001')],
          },
        ],
      },
      { advertiserId: ADVERTISER, lifetime: true, dimensions: ['stat_time_day'] },
    ]) {
      const result = await callTool('get-report', args);
      expect(result.success, JSON.stringify(args)).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes on TikTok rejecting a metric name', async () => {
    mockFetch(tiktokError(40002, 'Invalid metrics: [spendd]'));
    const result = await callTool('get-report', {
      advertiserId: ADVERTISER,
      metrics: ['spendd'],
      startDate: '2026-10-01',
      endDate: '2026-10-01',
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[BAD_REQUEST]');
    expect(errorOf(result)).toContain('spendd');
  });

  it('fails with a clear message when a page is too large', async () => {
    const wide: Record<string, string> = {};
    for (let i = 0; i < 40; i++) wide[`metric_${i}`] = '12345.678';
    const list = Array.from({ length: 500 }, (_, i) => reportRow('2026-10-01', String(i), wide));
    mockFetch(ok({ list, page_info: pageInfo(500, 1, 500) }));
    const result = await callTool('get-report', {
      advertiserId: ADVERTISER,
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      pageSize: 500,
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[RESULT_TOO_LARGE]');
    expect(errorOf(result)).toContain('pageSize');
  });
});

describe('pause-delivery and enable-delivery', () => {
  it('pauses ad groups with DISABLE', async () => {
    const fetchMock = mockFetch(ok({ adgroup_ids: [ADGROUP], status: 'DISABLE' }));
    const result = await callTool('pause-delivery', {
      advertiserId: ADVERTISER,
      level: 'adgroup',
      ids: [ADGROUP],
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: true,
      level: 'adgroup',
      operationStatus: 'DISABLE',
      updatedIds: [ADGROUP],
    });
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe('/open_api/v1.3/adgroup/status/update/');
    expect(JSON.parse(String(init.body))).toEqual({
      advertiser_id: ADVERTISER,
      adgroup_ids: [ADGROUP],
      operation_status: 'DISABLE',
    });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('enables campaigns with ENABLE and reports ids TikTok did not update', async () => {
    const other = '1800000000000000002';
    const fetchMock = mockFetch(ok({ campaign_ids: [CAMPAIGN], status: 'ENABLE' }));
    const result = await callTool('enable-delivery', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      ids: [CAMPAIGN, other],
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: true,
      level: 'campaign',
      operationStatus: 'ENABLE',
      updatedIds: [CAMPAIGN],
      notUpdatedIds: [other],
    });
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/campaign/status/update/');
    expect(JSON.parse(String(init.body))).toEqual({
      advertiser_id: ADVERTISER,
      campaign_ids: [CAMPAIGN, other],
      operation_status: 'ENABLE',
    });
  });

  it('enables ads through the ad endpoint', async () => {
    const fetchMock = mockFetch(ok({ ad_ids: [AD], status: 'ENABLE' }));
    const result = await callTool('enable-delivery', {
      advertiserId: ADVERTISER,
      level: 'ad',
      ids: [AD],
    });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(url.pathname).toBe('/open_api/v1.3/ad/status/update/');
    expect(JSON.parse(String(init.body)).ad_ids).toEqual([AD]);
  });

  it('rejects bad levels, too many ids and rounded ids before any request', async () => {
    const fetchMock = mockFetch();
    const many = Array.from({ length: 21 }, (_, i) => String(1000 + i));
    for (const [tool, args] of [
      ['pause-delivery', { advertiserId: ADVERTISER, level: 'account', ids: [CAMPAIGN] }],
      ['pause-delivery', { advertiserId: ADVERTISER, level: 'campaign', ids: many }],
      ['pause-delivery', { advertiserId: ADVERTISER, level: 'campaign', ids: [] }],
      [
        'enable-delivery',
        { advertiserId: ADVERTISER, level: 'ad', ids: [cliNumber('1800000000000000201')] },
      ],
      ['enable-delivery', { advertiserId: ADVERTISER, level: 'ad' }],
    ] as const) {
      const result = await callTool(tool, args);
      expect(result.success, JSON.stringify(args)).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a TikTok error on enable', async () => {
    mockFetch(tiktokError(40002, 'Campaign is deleted.'));
    const result = await callTool('enable-delivery', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      ids: [CAMPAIGN],
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('Campaign is deleted.');
  });
});

describe('update-budget', () => {
  it('reads the current campaign budget, then updates it', async () => {
    const fetchMock = mockFetch(
      ok({ list: [rawCampaign(CAMPAIGN)], page_info: pageInfo(1, 1, 1) }),
      ok({ campaign_id: CAMPAIGN }),
    );
    const result = await callTool('update-budget', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      id: CAMPAIGN,
      budget: 150.5,
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: true,
      level: 'campaign',
      id: CAMPAIGN,
      budgetMode: 'BUDGET_MODE_DAY',
      previousBudget: 100,
      budget: 150.5,
    });
    const read = requestOf(fetchMock, 0);
    expect(read.url.pathname).toBe('/open_api/v1.3/campaign/get/');
    expect(JSON.parse(read.url.searchParams.get('filtering') ?? '')).toEqual({
      campaign_ids: [CAMPAIGN],
    });
    const write = requestOf(fetchMock, 1);
    expect(write.init.method).toBe('POST');
    expect(write.url.pathname).toBe('/open_api/v1.3/campaign/update/');
    expect(JSON.parse(String(write.init.body))).toEqual({
      advertiser_id: ADVERTISER,
      campaign_id: CAMPAIGN,
      budget: 150.5,
    });
  });

  it('updates an ad group budget through adgroup/update', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [{ adgroup_id: ADGROUP, budget: 20, budget_mode: 'BUDGET_MODE_TOTAL' }],
        page_info: pageInfo(1, 1, 1),
      }),
      ok({ adgroup_id: ADGROUP }),
    );
    const result = await callTool('update-budget', {
      advertiserId: ADVERTISER,
      level: 'adgroup',
      id: ADGROUP,
      budget: 10,
    });
    expect(result.success).toBe(true);
    expect((result.result as Record<string, unknown>).previousBudget).toBe(20);
    const write = requestOf(fetchMock, 1);
    expect(write.url.pathname).toBe('/open_api/v1.3/adgroup/update/');
    expect(JSON.parse(String(write.init.body))).toEqual({
      advertiser_id: ADVERTISER,
      adgroup_id: ADGROUP,
      budget: 10,
    });
  });

  it('does not write when the item is not found', async () => {
    const fetchMock = mockFetch(ok({ list: [], page_info: pageInfo(0, 1, 1) }));
    const result = await callTool('update-budget', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      id: CAMPAIGN,
      budget: 50,
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('[NOT_FOUND]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not write when the item has no budget (BUDGET_MODE_INFINITE)', async () => {
    const fetchMock = mockFetch(
      ok({
        list: [
          {
            adgroup_id: ADGROUP,
            budget: 0,
            budget_mode: 'BUDGET_MODE_INFINITE',
          },
        ],
        page_info: pageInfo(1, 1, 1),
      }),
    );
    const result = await callTool('update-budget', {
      advertiserId: ADVERTISER,
      level: 'adgroup',
      id: ADGROUP,
      budget: 50,
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('BUDGET_MODE_INFINITE');
    expect(errorOf(result)).toContain('campaign budget');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects bad budgets, levels and ids before any request', async () => {
    const fetchMock = mockFetch();
    const base = { advertiserId: ADVERTISER, level: 'campaign', id: CAMPAIGN };
    for (const args of [
      { ...base, budget: 0 },
      { ...base, budget: -5 },
      { ...base, budget: 'lots' },
      { ...base, budget: 50_000_000 },
      { ...base, level: 'ad', budget: 10 },
      { ...base, id: cliNumber('1800000000000000001'), budget: 10 },
      { advertiserId: ADVERTISER, level: 'campaign', budget: 10 },
    ]) {
      const result = await callTool('update-budget', args);
      expect(result.success, JSON.stringify(args)).toBe(false);
      expect(errorOf(result)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a TikTok error from the update', async () => {
    mockFetch(
      ok({ list: [rawCampaign(CAMPAIGN)], page_info: pageInfo(1, 1, 1) }),
      tiktokError(40002, 'Budget cannot be lower than the minimum.'),
    );
    const result = await callTool('update-budget', {
      advertiserId: ADVERTISER,
      level: 'campaign',
      id: CAMPAIGN,
      budget: 1,
    });
    expect(result.success).toBe(false);
    expect(errorOf(result)).toContain('minimum');
  });
});
