/**
 * Write tool tests: the type check before each change, the exact form sent, the short
 * result, and the refusals that keep a write from landing on the wrong object or spending
 * money nobody asked for. The API is mocked.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID,
  AD_ID,
  AD_SET_ID,
  adSet,
  CAMPAIGN_ID,
  campaign,
  graphError,
} from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

const path = (url: URL) => url.pathname.replace('/v26.0', '');
const formOf = (init: RequestInit) => new URLSearchParams(String(init.body));

describe('pause-ad-object', () => {
  it('checks the id is a campaign, then posts status=PAUSED', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        id: CAMPAIGN_ID,
        name: 'Autumn sale',
        status: 'ACTIVE',
        effective_status: 'ACTIVE',
        objective: 'OUTCOME_SALES',
      }),
      jsonResponse({ success: true }),
    );
    const result = await callTool('pause-ad-object', { level: 'campaign', id: CAMPAIGN_ID });
    expect(result.success).toBe(true);
    const check = requestOf(fetchMock, 0);
    expect(check.init.method).toBe('GET');
    expect(path(check.url)).toBe(`/${CAMPAIGN_ID}`);
    expect(check.url.searchParams.get('fields')).toBe('id,name,status,effective_status,objective');
    const write = requestOf(fetchMock, 1);
    expect(write.init.method).toBe('POST');
    expect(path(write.url)).toBe(`/${CAMPAIGN_ID}`);
    expect((write.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(Object.fromEntries(formOf(write.init))).toEqual({ status: 'PAUSED' });
    expect(result.result).toEqual({
      success: true,
      id: CAMPAIGN_ID,
      name: 'Autumn sale',
      level: 'campaign',
      previousStatus: 'ACTIVE',
      status: 'PAUSED',
      changed: true,
    });
  });

  it('does not write when the object is already paused', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        id: AD_ID,
        name: 'Carousel A',
        status: 'PAUSED',
        effective_status: 'PAUSED',
        adset_id: AD_SET_ID,
      }),
    );
    const result = await callTool('pause-ad-object', { level: 'ad', id: AD_ID });
    expect(result.success).toBe(true);
    expect((result.result as { changed: boolean }).changed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses when the id is another kind of object, and writes nothing', async () => {
    const fetchMock = mockFetch(
      jsonResponse(
        graphError(
          100,
          '(#100) Tried accessing nonexisting field (adset_id) on node type (AdSet)',
          {
            type: 'GraphMethodException',
          },
        ),
        400,
      ),
    );
    const result = await callTool('pause-ad-object', { level: 'ad', id: AD_SET_ID });
    expect(result.success).toBe(false);
    const error = JSON.stringify(result.error);
    expect(error).toContain(`${AD_SET_ID} is not a ad`);
    expect(error).toContain('AdSet');
    expect(error).toContain('Nothing was changed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('needs a valid level and id before any request', async () => {
    const fetchMock = mockFetch();
    for (const args of [
      { id: CAMPAIGN_ID },
      { level: 'account', id: CAMPAIGN_ID },
      { level: 'ad' },
      { level: 'ad', id: '1/../2' },
    ]) {
      const result = await callTool('pause-ad-object', args);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('activate-ad-object', () => {
  it('checks the id is an ad set, then posts status=ACTIVE', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        id: AD_SET_ID,
        name: 'Spain 25-44',
        status: 'PAUSED',
        effective_status: 'PAUSED',
        optimization_goal: 'OFFSITE_CONVERSIONS',
      }),
      jsonResponse({ success: true }),
    );
    const result = await callTool('activate-ad-object', { level: 'adset', id: AD_SET_ID });
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock, 0).url.searchParams.get('fields')).toContain('optimization_goal');
    const write = requestOf(fetchMock, 1);
    expect(write.init.method).toBe('POST');
    expect(Object.fromEntries(formOf(write.init))).toEqual({ status: 'ACTIVE' });
    expect(result.result).toEqual({
      success: true,
      id: AD_SET_ID,
      name: 'Spain 25-44',
      level: 'adset',
      previousStatus: 'PAUSED',
      status: 'ACTIVE',
      changed: true,
    });
  });

  it("surfaces Meta's refusal of the write", async () => {
    mockFetch(
      jsonResponse({
        id: AD_ID,
        name: 'Carousel A',
        status: 'PAUSED',
        effective_status: 'PAUSED',
        adset_id: AD_SET_ID,
      }),
      jsonResponse(
        graphError(100, 'Invalid parameter', {
          error_subcode: 1487390,
          error_user_title: 'Ad account has no payment method',
          error_user_msg: 'Add a payment method before running ads.',
        }),
        400,
      ),
    );
    const result = await callTool('activate-ad-object', { level: 'ad', id: AD_ID });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('Add a payment method');
  });
});

describe('update-budget', () => {
  it('reads the current budget, then posts the new daily budget', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ ...campaign, lifetime_budget: '0' }),
      jsonResponse({ success: true }),
    );
    const result = await callTool('update-budget', {
      level: 'campaign',
      id: CAMPAIGN_ID,
      dailyBudget: 7500,
    });
    expect(result.success).toBe(true);
    expect(requestOf(fetchMock, 0).url.searchParams.get('fields')).toBe(
      'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
    );
    const write = requestOf(fetchMock, 1);
    expect(write.init.method).toBe('POST');
    expect(path(write.url)).toBe(`/${CAMPAIGN_ID}`);
    expect(Object.fromEntries(formOf(write.init))).toEqual({ daily_budget: '7500' });
    expect(result.result).toEqual({
      success: true,
      id: CAMPAIGN_ID,
      name: 'Autumn sale',
      level: 'campaign',
      budgetType: 'daily',
      previousBudget: 5000,
      newBudget: 7500,
      changed: true,
    });
  });

  it('refuses a campaign budget on a campaign whose ad sets hold the budget', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ id: CAMPAIGN_ID, name: 'ABO', status: 'ACTIVE', objective: 'OUTCOME_SALES' }),
    );
    const result = await callTool('update-budget', {
      level: 'campaign',
      id: CAMPAIGN_ID,
      dailyBudget: 7500,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('Update the ad sets');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses to switch an ad set from lifetime to daily', async () => {
    const fetchMock = mockFetch(
      jsonResponse({ ...adSet, daily_budget: '0', lifetime_budget: '100000' }),
    );
    const result = await callTool('update-budget', {
      level: 'adset',
      id: AD_SET_ID,
      dailyBudget: 2000,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('pass lifetimeBudget instead');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses an ad set budget when the campaign budget applies', async () => {
    mockFetch(jsonResponse(adSet));
    const result = await callTool('update-budget', {
      level: 'adset',
      id: AD_SET_ID,
      dailyBudget: 2000,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('Update the campaign');
  });

  it('does not write when the budget is unchanged', async () => {
    const fetchMock = mockFetch(jsonResponse(campaign));
    const result = await callTool('update-budget', {
      level: 'campaign',
      id: CAMPAIGN_ID,
      dailyBudget: 5000,
    });
    expect((result.result as { changed: boolean }).changed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ level: 'campaign', id: CAMPAIGN_ID }, 'exactly one'],
    [{ level: 'campaign', id: CAMPAIGN_ID, dailyBudget: 1, lifetimeBudget: 2 }, 'exactly one'],
    [{ level: 'campaign', id: CAMPAIGN_ID, dailyBudget: 50.5 }, 'minor units'],
    [{ level: 'campaign', id: CAMPAIGN_ID, dailyBudget: -100 }, 'minor units'],
    [{ level: 'ad', id: AD_ID, dailyBudget: 100 }, 'level must be one of campaign, adset'],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('update-budget', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('create-campaign', () => {
  it('creates a PAUSED campaign with ad set budgets and the v24+ sharing flag', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: CAMPAIGN_ID }));
    const result = await callTool('create-campaign', {
      accountId: ACCOUNT_ID,
      name: 'Black Friday',
      objective: 'outcome_traffic',
    });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(path(url)).toBe(`/${ACCOUNT_ID}/campaigns`);
    expect(Object.fromEntries(formOf(init))).toEqual({
      name: 'Black Friday',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: '[]',
      is_adset_budget_sharing_enabled: 'false',
    });
    expect(result.result).toEqual({
      success: true,
      id: CAMPAIGN_ID,
      name: 'Black Friday',
      accountId: ACCOUNT_ID,
      status: 'PAUSED',
    });
  });

  it('creates a PAUSED campaign with a campaign budget and special categories', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: CAMPAIGN_ID }));
    await callTool('create-campaign', {
      accountId: '1234567890123',
      name: 'Hiring',
      objective: 'OUTCOME_LEADS',
      specialAdCategories: ['EMPLOYMENT'],
      specialAdCategoryCountries: ['es', 'pt'],
      dailyBudget: 10000,
      bidStrategy: 'COST_CAP',
      // A status argument is ignored: creation is always paused.
      status: 'ACTIVE',
    });
    expect(Object.fromEntries(formOf(requestOf(fetchMock).init))).toEqual({
      name: 'Hiring',
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
      special_ad_categories: '["EMPLOYMENT"]',
      special_ad_category_country: '["ES","PT"]',
      daily_budget: '10000',
      bid_strategy: 'COST_CAP',
    });
  });

  it.each([
    [{ name: 'X', objective: 'OUTCOME_TRAFFIC' }, 'accountId is required'],
    [{ accountId: ACCOUNT_ID, objective: 'OUTCOME_TRAFFIC' }, 'name is required'],
    [{ accountId: ACCOUNT_ID, name: 'X', objective: 'LINK_CLICKS' }, 'objective must be one of'],
    [
      {
        accountId: ACCOUNT_ID,
        name: 'X',
        objective: 'OUTCOME_SALES',
        dailyBudget: 1,
        lifetimeBudget: 1,
      },
      'not both',
    ],
    [
      { accountId: ACCOUNT_ID, name: 'X', objective: 'OUTCOME_SALES', bidStrategy: 'COST_CAP' },
      'per ad set',
    ],
    [
      {
        accountId: ACCOUNT_ID,
        name: 'X',
        objective: 'OUTCOME_SALES',
        dailyBudget: 100,
        adSetBudgetSharing: true,
      },
      'adSetBudgetSharing',
    ],
    [
      {
        accountId: ACCOUNT_ID,
        name: 'X',
        objective: 'OUTCOME_SALES',
        specialAdCategories: ['ALCOHOL'],
      },
      'specialAdCategories',
    ],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('create-campaign', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Meta's validation message", async () => {
    mockFetch(
      jsonResponse(
        graphError(100, 'Invalid parameter', {
          error_subcode: 4834011,
          error_user_title: 'No Special Ad Category Selected',
          error_user_msg: 'You need to select a special ad category.',
        }),
        400,
      ),
    );
    const result = await callTool('create-campaign', {
      accountId: ACCOUNT_ID,
      name: 'X',
      objective: 'OUTCOME_TRAFFIC',
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[BAD_REQUEST]');
    expect(JSON.stringify(result.error)).toContain('select a special ad category');
  });
});

describe('create-ad-set', () => {
  const base = {
    accountId: ACCOUNT_ID,
    campaignId: CAMPAIGN_ID,
    name: 'Spain 25-44',
    optimizationGoal: 'LINK_CLICKS',
    targeting: { geo_locations: { countries: ['ES'] }, age_min: 25, age_max: 44 },
  };

  it('creates a PAUSED ad set with JSON-encoded targeting', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: AD_SET_ID }));
    const result = await callTool('create-ad-set', {
      ...base,
      dailyBudget: 2000,
      startTime: '2026-11-01T00:00:00+0100',
      promotedObject: '{"page_id":"111222333444555"}',
    });
    expect(result.success).toBe(true);
    const { url, init } = requestOf(fetchMock);
    expect(init.method).toBe('POST');
    expect(path(url)).toBe(`/${ACCOUNT_ID}/adsets`);
    expect(Object.fromEntries(formOf(init))).toEqual({
      name: 'Spain 25-44',
      campaign_id: CAMPAIGN_ID,
      status: 'PAUSED',
      optimization_goal: 'LINK_CLICKS',
      billing_event: 'IMPRESSIONS',
      targeting: '{"geo_locations":{"countries":["ES"]},"age_min":25,"age_max":44}',
      daily_budget: '2000',
      start_time: '2026-11-01T00:00:00+0100',
      promoted_object: '{"page_id":"111222333444555"}',
    });
    expect(result.result).toEqual({
      success: true,
      id: AD_SET_ID,
      name: 'Spain 25-44',
      campaignId: CAMPAIGN_ID,
      status: 'PAUSED',
    });
  });

  it.each([
    [{ ...base, targeting: { age_min: 18 } }, 'geo_locations'],
    [{ ...base, targeting: 'not json' }, 'not valid JSON'],
    [{ ...base, lifetimeBudget: 50000 }, 'needs endTime'],
    [{ ...base, dailyBudget: 1, lifetimeBudget: 1 }, 'not both'],
    [{ ...base, startTime: 'tomorrow' }, 'ISO 8601'],
    [{ ...base, optimizationGoal: 'LINK CLICKS; x' }, 'optimizationGoal'],
    [{ ...base, billingEvent: 'CPC' }, 'billingEvent must be one of'],
    [{ ...base, campaignId: undefined }, 'campaignId is required'],
  ])('rejects %j before any request', async (args, message) => {
    const fetchMock = mockFetch();
    const result = await callTool('create-ad-set', args);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Meta's validation message", async () => {
    mockFetch(
      jsonResponse(
        graphError(100, 'Invalid parameter', {
          error_subcode: 2490408,
          error_user_title: 'Performance goal not available',
          error_user_msg: 'The performance goal you selected is not available for this objective.',
        }),
        400,
      ),
    );
    const result = await callTool('create-ad-set', { ...base, dailyBudget: 2000 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('not available for this objective');
  });
});
