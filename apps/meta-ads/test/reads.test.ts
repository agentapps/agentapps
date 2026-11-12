/**
 * Read tool tests: the outgoing request (path, query, method) and the returned shape, plus
 * argument errors (rejected before any request) and size limits. The API is mocked.
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import {
  ACCOUNT_ID,
  AD_ID,
  AD_SET_ID,
  ad,
  adAccount,
  adSet,
  CAMPAIGN_ID,
  campaign,
  creative,
  graphError,
  insightsRow,
  page,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

const path = (url: URL) => url.pathname.replace('/v26.0', '');

describe('list-ad-accounts', () => {
  it("requests the token's ad accounts and returns curated items with a cursor", async () => {
    const fetchMock = mockFetch(jsonResponse(page([adAccount], 'NEXTCURSOR')));
    const result = await callTool('list-ad-accounts', { limit: 10 });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(path(url)).toBe('/me/adaccounts');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('fields')).toBe(
      'id,account_id,name,account_status,currency,timezone_name,amount_spent,spend_cap,business{id,name}',
    );
    expect(result.result).toEqual({
      items: [
        {
          id: ACCOUNT_ID,
          name: 'Acme Shop & Co',
          status: 'ACTIVE',
          currency: 'EUR',
          timezone: 'Europe/Madrid',
          amountSpent: 1234567,
          business: { id: '987654321098765', name: 'Acme Business' },
        },
      ],
      count: 1,
      nextCursor: 'NEXTCURSOR',
    });
  });

  it('omits the cursor on the last page and passes `after` through', async () => {
    const fetchMock = mockFetch(jsonResponse(page([])));
    const result = await callTool('list-ad-accounts', { after: 'ABC' });
    expect(requestOf(fetchMock).url.searchParams.get('after')).toBe('ABC');
    expect(result.result).toEqual({ items: [], count: 0 });
  });

  it('rejects a limit above 100 before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-ad-accounts', { limit: 1000 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-campaigns', () => {
  it('accepts the account id with or without act_ and sends statuses as a JSON array', async () => {
    const fetchMock = mockFetch(jsonResponse(page([campaign])));
    const result = await callTool('list-campaigns', {
      // The CLI turns digits into a number.
      accountId: 1234567890123,
      statuses: 'active,paused',
    });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${ACCOUNT_ID}/campaigns`);
    expect(url.searchParams.get('effective_status')).toBe('["ACTIVE","PAUSED"]');
    expect(url.search).toContain('effective_status=%5B%22ACTIVE%22%2C%22PAUSED%22%5D');
    expect(result.result).toEqual({
      items: [
        {
          id: CAMPAIGN_ID,
          name: 'Autumn sale',
          objective: 'OUTCOME_SALES',
          status: 'ACTIVE',
          effectiveStatus: 'ACTIVE',
          dailyBudget: 5000,
          budgetRemaining: 3120,
          bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
          startTime: '2026-09-01T10:00:00+0200',
          updatedTime: '2026-10-01T09:30:00+0200',
        },
      ],
      count: 1,
    });
  });

  it('rejects an unknown status and a missing account before any request', async () => {
    const fetchMock = mockFetch();
    const r1 = await callTool('list-campaigns', { accountId: ACCOUNT_ID, statuses: ['RUNNING'] });
    const r2 = await callTool('list-campaigns', {});
    const r3 = await callTool('list-campaigns', { accountId: 'act_../../me' });
    for (const r of [r1, r2, r3]) {
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a permission error with the scope to add', async () => {
    mockFetch(
      jsonResponse(
        graphError(
          200,
          '(#200) Ad account owner has NOT permission ads_management or ads_read permission',
        ),
        400,
      ),
    );
    const result = await callTool('list-campaigns', { accountId: ACCOUNT_ID });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[FORBIDDEN]');
    expect(JSON.stringify(result.error)).toContain('ads_read');
  });
});

describe('list-ad-sets', () => {
  it("lists a campaign's ad sets, hides zero budgets and omits targeting by default", async () => {
    const fetchMock = mockFetch(jsonResponse(page([adSet])));
    const result = await callTool('list-ad-sets', { campaignId: CAMPAIGN_ID });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${CAMPAIGN_ID}/adsets`);
    expect(url.searchParams.get('fields')).not.toContain('targeting');
    const item = (result.result as { items: Record<string, unknown>[] }).items[0];
    expect(item).toEqual({
      id: AD_SET_ID,
      name: 'Spain 25-44',
      campaignId: CAMPAIGN_ID,
      status: 'ACTIVE',
      effectiveStatus: 'CAMPAIGN_PAUSED',
      budgetRemaining: 0,
      optimizationGoal: 'OFFSITE_CONVERSIONS',
      billingEvent: 'IMPRESSIONS',
      startTime: '2026-09-01T10:00:00+0200',
    });
  });

  it("lists an account's ad sets with targeting on request", async () => {
    const fetchMock = mockFetch(jsonResponse(page([adSet])));
    const result = await callTool('list-ad-sets', {
      accountId: ACCOUNT_ID,
      includeTargeting: true,
    });
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${ACCOUNT_ID}/adsets`);
    expect(url.searchParams.get('fields')).toContain('targeting');
    const item = (result.result as { items: Record<string, unknown>[] }).items[0];
    expect(item.targeting).toEqual(adSet.targeting);
  });

  it('rejects a campaign id the CLI has already rounded', async () => {
    const fetchMock = mockFetch();
    // 120210000000000001 as a JavaScript number is no longer that id.
    const result = await callTool('list-ad-sets', { campaignId: Number(CAMPAIGN_ID) });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('JSON object');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('needs a campaign or an account', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-ad-sets', {});
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-ads', () => {
  it('prefers the ad set over the campaign and returns creative and issues', async () => {
    const fetchMock = mockFetch(jsonResponse(page([ad])));
    const result = await callTool('list-ads', { adSetId: AD_SET_ID, campaignId: CAMPAIGN_ID });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${AD_SET_ID}/ads`);
    expect(url.searchParams.get('fields')).toContain(
      'creative{id,name,title,body,thumbnail_url,call_to_action_type}',
    );
    expect((result.result as { items: unknown[] }).items[0]).toEqual({
      id: AD_ID,
      name: 'Carousel A',
      adSetId: AD_SET_ID,
      campaignId: CAMPAIGN_ID,
      status: 'ACTIVE',
      effectiveStatus: 'WITH_ISSUES',
      updatedTime: '2026-10-02T11:00:00+0200',
      creative: {
        id: '120210000000000004',
        name: 'Carousel creative',
        title: 'Autumn sale',
        body: '30% off this week',
        thumbnailUrl: 'https://scontent.example.fbcdn.net/thumb.jpg',
        callToAction: 'SHOP_NOW',
      },
      issues: ['Image too small'],
    });
  });

  it('falls back to the account', async () => {
    const fetchMock = mockFetch(jsonResponse(page([])));
    await callTool('list-ads', { accountId: ACCOUNT_ID });
    expect(path(requestOf(fetchMock).url)).toBe(`/${ACCOUNT_ID}/ads`);
  });

  it('rejects an id with a path in it', async () => {
    const fetchMock = mockFetch();
    const result = await callTool('list-ads', { adSetId: '123/../me' });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('list-creatives', () => {
  it("lists an account's creatives", async () => {
    const fetchMock = mockFetch(jsonResponse(page([creative])));
    const result = await callTool('list-creatives', { accountId: ACCOUNT_ID, limit: 5 });
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${ACCOUNT_ID}/adcreatives`);
    expect(url.searchParams.get('limit')).toBe('5');
    expect((result.result as { items: unknown[] }).items[0]).toEqual({
      id: '120210000000000004',
      name: 'Carousel creative',
      status: 'ACTIVE',
      title: 'Autumn sale',
      body: '30% off this week',
      objectType: 'SHARE',
      thumbnailUrl: 'https://scontent.example.fbcdn.net/thumb.jpg',
      callToAction: 'SHOP_NOW',
      storyId: '111222333444555_666777888999000',
    });
  });

  it('needs an account', async () => {
    const fetchMock = mockFetch();
    expect((await callTool('list-creatives', {})).success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('get-insights', () => {
  it('defaults to last_30d, unified attribution and the base metrics', async () => {
    const fetchMock = mockFetch(jsonResponse(page([insightsRow])));
    const result = await callTool('get-insights', { id: CAMPAIGN_ID });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('GET');
    expect(url.origin + url.pathname).toBe(`${BASE_URL}/${CAMPAIGN_ID}/insights`);
    expect(url.searchParams.get('date_preset')).toBe('last_30d');
    expect(url.searchParams.get('use_unified_attribution_setting')).toBe('true');
    expect(url.searchParams.get('fields')).toBe(
      'spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,account_currency',
    );
    expect(url.searchParams.has('level')).toBe(false);
    expect(url.searchParams.get('limit')).toBe('100');
    expect((result.result as { items: unknown[] }).items[0]).toEqual({
      campaign_id: CAMPAIGN_ID,
      campaign_name: 'Autumn sale',
      spend: 53.39,
      impressions: 36132,
      reach: 20011,
      frequency: 1.805607,
      clicks: 734,
      ctr: 2.03144,
      cpc: 0.072738,
      cpm: 1.477637,
      account_currency: 'EUR',
      date_start: '2026-09-17',
      date_stop: '2026-10-16',
    });
  });

  it('sends a custom range, level, daily increment, breakdowns and sort', async () => {
    const fetchMock = mockFetch(
      jsonResponse(page([{ ...insightsRow, region: 'Madrid', zip: '08001' }])),
    );
    const result = await callTool('get-insights', {
      id: ACCOUNT_ID,
      level: 'campaign',
      since: '2026-10-01',
      until: '2026-10-07',
      timeIncrement: 1,
      breakdowns: ['region', 'zip'],
      fields: 'spend,actions',
      sort: 'spend_descending',
    });
    expect(result.success).toBe(true);
    const { url } = requestOf(fetchMock);
    expect(path(url)).toBe(`/${ACCOUNT_ID}/insights`);
    expect(url.searchParams.get('level')).toBe('campaign');
    expect(url.searchParams.get('time_range')).toBe('{"since":"2026-10-01","until":"2026-10-07"}');
    expect(url.searchParams.has('date_preset')).toBe(false);
    expect(url.searchParams.get('time_increment')).toBe('1');
    expect(url.searchParams.get('breakdowns')).toBe('region,zip');
    expect(url.searchParams.get('fields')).toBe('campaign_id,campaign_name,spend,actions');
    expect(url.searchParams.get('sort')).toBe('["spend_descending"]');
    // Breakdown values stay strings, even when they look like numbers.
    const row = (result.result as { items: Record<string, unknown>[] }).items[0];
    expect(row.zip).toBe('08001');
    expect(row.campaign_id).toBe(CAMPAIGN_ID);
  });

  it('turns action values into numbers', async () => {
    mockFetch(
      jsonResponse(
        page([
          {
            spend: '10.5',
            actions: [
              { action_type: 'link_click', value: '42' },
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
            ],
            date_start: '2026-10-01',
            date_stop: '2026-10-07',
          },
        ]),
      ),
    );
    const result = await callTool('get-insights', { id: ACCOUNT_ID, fields: ['spend', 'actions'] });
    const row = (result.result as { items: Record<string, unknown>[] }).items[0];
    expect(row.actions).toEqual([
      { action_type: 'link_click', value: 42 },
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: 3 },
    ]);
  });

  it.each([
    [{ id: ACCOUNT_ID, since: '2026-10-01' }, 'both since and until'],
    [{ id: ACCOUNT_ID, since: '2026-10-07', until: '2026-10-01' }, 'is after'],
    [{ id: ACCOUNT_ID, since: '2026-02-30', until: '2026-03-01' }, 'YYYY-MM-DD'],
    [{ id: ACCOUNT_ID, datePreset: 'last_2_weeks' }, 'datePreset must be one of'],
    [{ id: ACCOUNT_ID, level: 'creative' }, 'level must be one of'],
    [{ id: ACCOUNT_ID, timeIncrement: 365 }, 'timeIncrement'],
    [{ id: ACCOUNT_ID, breakdowns: ['age', 'gender', 'country', 'region'] }, 'at most 3'],
    [{ id: ACCOUNT_ID, fields: ['spend', 'spend&x=1'] }, 'not a field name'],
    [{ id: ACCOUNT_ID, sort: 'spend' }, 'sort must be'],
    [{ id: ACCOUNT_ID, limit: 501 }, 'limit'],
    [{}, 'id is required'],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('get-insights', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps an oversized report under 50,000 characters and says how to page', async () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      ...insightsRow,
      campaign_name: `Campaign ${i} ${'x'.repeat(80)}`,
    }));
    mockFetch(jsonResponse(page(rows, 'NEXT')));
    const result = await callTool('get-insights', {
      id: ACCOUNT_ID,
      level: 'campaign',
      limit: 500,
    });
    expect(result.success).toBe(true);
    const body = result.result as { items: unknown[]; limitApplied?: boolean; hint?: string };
    expect(JSON.stringify(body).length).toBeLessThan(50_000);
    expect(body.limitApplied).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.length).toBeLessThan(500);
    expect(body.hint).toContain(`limit:${body.items.length}`);
  });

  it("explains a report that timed out on Meta's side", async () => {
    mockFetch(
      jsonResponse(
        graphError(
          100,
          "Please reduce the amount of data you're asking for, then retry your request",
          {
            error_subcode: 1504018,
          },
        ),
        400,
      ),
    );
    const result = await callTool('get-insights', { id: ACCOUNT_ID, datePreset: 'maximum' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('reduce the amount of data');
  });
});
