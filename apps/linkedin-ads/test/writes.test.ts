/**
 * Write tools: each sends one Rest.li PARTIAL_UPDATE (POST + X-RestLi-Method header +
 * `{ patch: { $set } }`) to the right entity, returns a short summary, and validates its
 * arguments before any request.
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import { account, campaign, campaignGroup } from './fixtures.js';
import { callTool, jsonResponse, mockFetch, requestOf } from './harness.js';

const noContent = () => new Response(null, { status: 204 });

function expectPartialUpdate(
  fetchMock: Parameters<typeof requestOf>[0],
  index: number,
  path: string,
  set: Record<string, unknown>,
) {
  const { url, init } = requestOf(fetchMock, index);
  expect(url.href).toBe(`${BASE_URL}${path}`);
  expect(init.method).toBe('POST');
  const headers = init.headers as Record<string, string>;
  expect(headers['X-RestLi-Method']).toBe('PARTIAL_UPDATE');
  expect(headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(String(init.body))).toEqual({ patch: { $set: set } });
}

const statusTools: Array<{
  tool: string;
  idArg: string;
  path: string;
  set: Record<string, string>;
}> = [
  {
    tool: 'pause-campaign',
    idArg: 'campaignId',
    path: '/adAccounts/508000001/adCampaigns/141000001',
    set: { status: 'PAUSED' },
  },
  {
    tool: 'activate-campaign',
    idArg: 'campaignId',
    path: '/adAccounts/508000001/adCampaigns/141000001',
    set: { status: 'ACTIVE' },
  },
  {
    tool: 'pause-campaign-group',
    idArg: 'campaignGroupId',
    path: '/adAccounts/508000001/adCampaignGroups/141000001',
    set: { status: 'PAUSED' },
  },
  {
    tool: 'activate-campaign-group',
    idArg: 'campaignGroupId',
    path: '/adAccounts/508000001/adCampaignGroups/141000001',
    set: { status: 'ACTIVE' },
  },
  {
    tool: 'pause-creative',
    idArg: 'creativeId',
    path: '/adAccounts/508000001/creatives/urn%3Ali%3AsponsoredCreative%3A141000001',
    set: { intendedStatus: 'PAUSED' },
  },
  {
    tool: 'activate-creative',
    idArg: 'creativeId',
    path: '/adAccounts/508000001/creatives/urn%3Ali%3AsponsoredCreative%3A141000001',
    set: { intendedStatus: 'ACTIVE' },
  },
];

describe.each(statusTools)('$tool', ({ tool, idArg, path, set }) => {
  it('sends one partial update and returns a short summary', async () => {
    const fetchMock = mockFetch(noContent());
    const msg = await callTool(tool, { accountId: 508000001, [idArg]: 141000001 });
    expect(msg.success, JSON.stringify(msg.error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectPartialUpdate(fetchMock, 0, path, set);
    expect(msg.result).toMatchObject({
      success: true,
      id: '141000001',
      accountId: '508000001',
      ...set,
    });
  });

  it('rejects a non-numeric id before any request', async () => {
    const fetchMock = mockFetch();
    const msg = await callTool(tool, { accountId: 508000001, [idArg]: '../141000001' });
    expect(JSON.stringify(msg.error)).toContain(`[BAD_REQUEST] ${idArg}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces LinkedIn's rejection", async () => {
    mockFetch(
      jsonResponse({ message: 'Cannot change status of entity in review', status: 400 }, 400),
    );
    const msg = await callTool(tool, { accountId: 508000001, [idArg]: 141000001 });
    expect(msg.success).toBe(false);
    expect(JSON.stringify(msg.error)).toContain('Cannot change status of entity in review');
  });
});

describe('write permission errors', () => {
  it('names rw_ads on a 403', async () => {
    mockFetch(jsonResponse({ message: 'Not enough permissions' }, 403));
    const msg = await callTool('pause-campaign', { accountId: 1, campaignId: 2 });
    expect(JSON.stringify(msg.error)).toContain('rw_ads');
    expect(JSON.stringify(msg.error)).toContain('VIEWER');
  });
});

describe('update-campaign-budget', () => {
  it('reads the campaign, keeps its currency and sets the new budgets', async () => {
    const fetchMock = mockFetch(jsonResponse(campaign), noContent());
    const msg = await callTool('update-campaign-budget', {
      accountId: 508000001,
      campaignId: 141000001,
      dailyBudget: 49.99,
      totalBudget: '3000',
    });
    expect(msg.success, JSON.stringify(msg.error)).toBe(true);
    expect(requestOf(fetchMock, 0).init.method).toBe('GET');
    expectPartialUpdate(fetchMock, 1, '/adAccounts/508000001/adCampaigns/141000001', {
      dailyBudget: { amount: '49.99', currencyCode: 'EUR' },
      totalBudget: { amount: '3000', currencyCode: 'EUR' },
    });
    expect(msg.result).toEqual({
      success: true,
      id: '141000001',
      accountId: '508000001',
      name: 'Sponsored update B',
      status: 'ACTIVE',
      previous: { dailyBudget: { amount: '1800', currencyCode: 'EUR' }, totalBudget: null },
      updated: {
        dailyBudget: { amount: '49.99', currencyCode: 'EUR' },
        totalBudget: { amount: '3000', currencyCode: 'EUR' },
      },
    });
  });

  it('falls back to the account currency when the campaign has no budget yet', async () => {
    const { dailyBudget: _d, ...withoutBudget } = campaign;
    const fetchMock = mockFetch(jsonResponse(withoutBudget), jsonResponse(account), noContent());
    const msg = await callTool('update-campaign-budget', {
      accountId: 508000001,
      campaignId: 141000001,
      dailyBudget: 25,
    });
    expect(msg.success).toBe(true);
    expect(requestOf(fetchMock, 1).url.href).toBe(`${BASE_URL}/adAccounts/508000001`);
    expectPartialUpdate(fetchMock, 2, '/adAccounts/508000001/adCampaigns/141000001', {
      dailyBudget: { amount: '25', currencyCode: 'EUR' },
    });
  });

  it('rejects missing, negative, zero and over-precise amounts before any request', async () => {
    const fetchMock = mockFetch();
    for (const extra of [
      {},
      { dailyBudget: -5 },
      { dailyBudget: 0 },
      { totalBudget: '10.555' },
      { dailyBudget: '1e3' },
    ]) {
      const msg = await callTool('update-campaign-budget', {
        accountId: 1,
        campaignId: 2,
        ...extra,
      });
      expect(msg.success, JSON.stringify(extra)).toBe(false);
      expect(JSON.stringify(msg.error)).toContain('[BAD_REQUEST]');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not send the update when the campaign cannot be read', async () => {
    const fetchMock = mockFetch(jsonResponse({ message: 'Not found' }, 404));
    const msg = await callTool('update-campaign-budget', {
      accountId: 1,
      campaignId: 2,
      dailyBudget: 20,
    });
    expect(JSON.stringify(msg.error)).toContain('[NOT_FOUND]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('update-campaign-group-budget', () => {
  it('reads the group, keeps its currency and sets the total budget', async () => {
    const fetchMock = mockFetch(jsonResponse(campaignGroup), noContent());
    const msg = await callTool('update-campaign-group-budget', {
      accountId: 508000001,
      campaignGroupId: 'urn:li:sponsoredCampaignGroup:604000001',
      totalBudget: 75000,
    });
    expect(msg.success, JSON.stringify(msg.error)).toBe(true);
    expectPartialUpdate(fetchMock, 1, '/adAccounts/508000001/adCampaignGroups/604000001', {
      totalBudget: { amount: '75000', currencyCode: 'EUR' },
    });
    expect(msg.result).toMatchObject({
      success: true,
      id: '604000001',
      previous: { totalBudget: { amount: '60000', currencyCode: 'EUR' } },
      updated: { totalBudget: { amount: '75000', currencyCode: 'EUR' } },
    });
  });

  it('requires totalBudget', async () => {
    const fetchMock = mockFetch();
    const msg = await callTool('update-campaign-group-budget', {
      accountId: 1,
      campaignGroupId: 2,
    });
    expect(JSON.stringify(msg.error)).toContain('totalBudget is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
