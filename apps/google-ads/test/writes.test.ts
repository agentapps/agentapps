/**
 * Write tools: the mutate each one sends, the short summary it returns, and the
 * argument checks that run before anything reaches Google. The API is mocked (fetch).
 */

import { describe, expect, it } from 'vitest';
import { BASE_URL } from '../src/lib/client.js';
import { adsFailure, CUSTOMER, MANAGER, searchPage, sent } from './fixtures.js';
import { callTool, jsonResponse, mockFetch } from './harness.js';

const mutated = (resourceName: string) => jsonResponse({ results: [{ resourceName }] });

describe.each([
  ['pause-campaign', 'campaignId', 'campaigns', 'PAUSED'],
  ['enable-campaign', 'campaignId', 'campaigns', 'ENABLED'],
  ['pause-ad-group', 'adGroupId', 'adGroups', 'PAUSED'],
  ['enable-ad-group', 'adGroupId', 'adGroups', 'ENABLED'],
] as const)('%s', (tool, idName, service, status) => {
  it(`sets status ${status} with an update mask and returns a summary`, async () => {
    const resourceName = `customers/${CUSTOMER}/${service}/20123456789`;
    const fetchMock = mockFetch(mutated(resourceName));
    const result = await callTool(tool, {
      customerId: '123-456-7890',
      loginCustomerId: MANAGER,
      [idName]: 20123456789,
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: true,
      [idName]: '20123456789',
      resourceName,
      status,
      validateOnly: false,
    });
    const req = sent(fetchMock);
    expect(req.url.href).toBe(`${BASE_URL}/customers/${CUSTOMER}/${service}:mutate`);
    expect(req.method).toBe('POST');
    expect(req.headers['login-customer-id']).toBe(MANAGER);
    expect(req.body).toEqual({
      operations: [{ updateMask: 'status', update: { resourceName, status } }],
      validateOnly: false,
    });
  });

  it('passes validateOnly through for a dry run (Google answers without results)', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const result = await callTool(tool, {
      customerId: CUSTOMER,
      [idName]: '5',
      validateOnly: true,
    });
    expect(result.success).toBe(true);
    expect((result.result as any).validateOnly).toBe(true);
    expect(sent(fetchMock).body.validateOnly).toBe(true);
  });

  it('rejects an ID that is not numeric, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool(tool, { customerId: CUSTOMER, [idName]: '5/../../7' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(`${idName} must be a numeric ID`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing ID, before any request', async () => {
    const fetchMock = mockFetch();
    const result = await callTool(tool, { customerId: CUSTOMER });
    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a not-found mutate error', async () => {
    mockFetch(
      adsFailure(400, 'INVALID_ARGUMENT', [
        { errorCode: { mutateError: 'RESOURCE_NOT_FOUND' }, message: 'Resource was not found.' },
      ]),
    );
    const result = await callTool(tool, { customerId: CUSTOMER, [idName]: 1 });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('mutateError.RESOURCE_NOT_FOUND');
  });
});

describe('update-campaign-budget', () => {
  const budgetRow = (extra: Record<string, unknown> = {}) =>
    searchPage([
      {
        customer: { resourceName: `customers/${CUSTOMER}`, currencyCode: 'EUR' },
        campaignBudget: {
          resourceName: `customers/${CUSTOMER}/campaignBudgets/13579`,
          id: '13579',
          name: 'Brand budget',
          amountMicros: '20000000',
          status: 'ENABLED',
          period: 'DAILY',
          referenceCount: '2',
          ...extra,
        },
      },
    ]);

  it('reads the budget, then sets amountMicros rounded to cents', async () => {
    const fetchMock = mockFetch(
      budgetRow(),
      mutated(`customers/${CUSTOMER}/campaignBudgets/13579`),
    );
    const result = await callTool('update-campaign-budget', {
      customerId: CUSTOMER,
      budgetId: 13579,
      amount: 35.555,
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: true,
      budgetId: '13579',
      name: 'Brand budget',
      previousAmount: 20,
      newAmount: 35.56,
      currency: 'EUR',
      period: 'DAILY',
      campaignCount: 2,
      validateOnly: false,
    });
    expect(sent(fetchMock, 0).body.query).toContain('WHERE campaign_budget.id = 13579');
    const req = sent(fetchMock, 1);
    expect(req.url.href).toBe(`${BASE_URL}/customers/${CUSTOMER}/campaignBudgets:mutate`);
    expect(req.body).toEqual({
      operations: [
        {
          updateMask: 'amountMicros',
          update: {
            resourceName: `customers/${CUSTOMER}/campaignBudgets/13579`,
            amountMicros: '35560000',
          },
        },
      ],
      validateOnly: false,
    });
  });

  it('fails with NOT_FOUND, without a mutate, when the budget does not exist', async () => {
    const fetchMock = mockFetch(searchPage([]));
    const result = await callTool('update-campaign-budget', {
      customerId: CUSTOMER,
      budgetId: 1,
      amount: 10,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain('[NOT_FOUND]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a removed budget', async () => {
    const fetchMock = mockFetch(budgetRow({ status: 'REMOVED' }));
    const result = await callTool('update-campaign-budget', {
      customerId: CUSTOMER,
      budgetId: 13579,
      amount: 10,
    });
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a currency-unit error', async () => {
    mockFetch(
      budgetRow(),
      adsFailure(400, 'INVALID_ARGUMENT', [
        {
          errorCode: { campaignBudgetError: 'NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT' },
          message: 'The budget amount must be a multiple of the minimum currency unit.',
        },
      ]),
    );
    const result = await callTool('update-campaign-budget', {
      customerId: CUSTOMER,
      budgetId: 13579,
      amount: 10.5,
    });
    expect(JSON.stringify(result.error)).toContain('smallest unit');
  });

  it.each([
    [{ amount: 0 }, 'positive number'],
    [{ amount: -5 }, 'positive number'],
    [{ amount: 'lots' }, 'positive number'],
    [{ amount: 50_000_000 * 1_000 }, 'micros'],
    [{ amount: 0.001 }, 'rounds to 0'],
    [{ amount: 10, budgetId: 'abc' }, 'budgetId must be a numeric ID'],
  ])('rejects %j before any request', async (args, text) => {
    const fetchMock = mockFetch();
    const result = await callTool('update-campaign-budget', {
      customerId: CUSTOMER,
      budgetId: 13579,
      ...args,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(text);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('add-negative-keywords', () => {
  it('creates campaign-level negatives with partial failure and reports each keyword', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        partialFailureError: {
          code: 3,
          message: 'Duplicate criterion, at operations[1].create',
          details: [
            {
              '@type': 'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure',
              errors: [
                {
                  errorCode: { criterionError: 'DUPLICATE_KEYWORD' },
                  message: 'Duplicate keyword.',
                  location: {
                    fieldPathElements: [
                      { fieldName: 'operations', index: 1 },
                      { fieldName: 'create' },
                    ],
                  },
                },
              ],
              requestId: 'synthetic-request-id-2',
            },
          ],
        },
        results: [{ resourceName: `customers/${CUSTOMER}/campaignCriteria/111~555` }, {}],
      }),
    );
    const result = await callTool('add-negative-keywords', {
      customerId: CUSTOMER,
      campaignId: 111,
      keywords: ['  free   shoes ', { text: 'jobs', matchType: 'phrase' }],
    });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      success: false,
      level: 'CAMPAIGN',
      campaignId: '111',
      added: [
        {
          text: 'free shoes',
          matchType: 'EXACT',
          resourceName: `customers/${CUSTOMER}/campaignCriteria/111~555`,
        },
      ],
      failed: [
        {
          text: 'jobs',
          matchType: 'PHRASE',
          error: 'criterionError.DUPLICATE_KEYWORD: Duplicate keyword.',
        },
      ],
      validateOnly: false,
    });
    const req = sent(fetchMock);
    expect(req.url.href).toBe(`${BASE_URL}/customers/${CUSTOMER}/campaignCriteria:mutate`);
    expect(req.body).toEqual({
      operations: [
        {
          create: {
            campaign: `customers/${CUSTOMER}/campaigns/111`,
            negative: true,
            keyword: { text: 'free shoes', matchType: 'EXACT' },
          },
        },
        {
          create: {
            campaign: `customers/${CUSTOMER}/campaigns/111`,
            negative: true,
            keyword: { text: 'jobs', matchType: 'PHRASE' },
          },
        },
      ],
      partialFailure: true,
      validateOnly: false,
    });
  });

  it('creates ad group-level negatives with the default match type', async () => {
    const fetchMock = mockFetch(
      jsonResponse({
        results: [{ resourceName: `customers/${CUSTOMER}/adGroupCriteria/222~666` }],
      }),
    );
    const result = await callTool('add-negative-keywords', {
      customerId: CUSTOMER,
      adGroupId: '222',
      keywords: ['cheap'],
      matchType: 'BROAD',
    });
    expect((result.result as any).success).toBe(true);
    expect((result.result as any).added).toHaveLength(1);
    const req = sent(fetchMock);
    expect(req.url.pathname).toBe(`/v26/customers/${CUSTOMER}/adGroupCriteria:mutate`);
    expect(req.body.operations[0].create).toEqual({
      adGroup: `customers/${CUSTOMER}/adGroups/222`,
      negative: true,
      keyword: { text: 'cheap', matchType: 'BROAD' },
    });
  });

  it.each([
    [{ keywords: ['x'] }, 'exactly one of campaignId or adGroupId'],
    [{ campaignId: 1, adGroupId: 2, keywords: ['x'] }, 'exactly one of campaignId or adGroupId'],
    [{ campaignId: 1, keywords: [] }, 'non-empty array'],
    [{ campaignId: 1, keywords: 'free' }, 'non-empty array'],
    [{ campaignId: 1, keywords: ['   '] }, 'has no text'],
    [{ campaignId: 1, keywords: ['a'.repeat(81)] }, 'too long'],
    [
      { campaignId: 1, keywords: ['one two three four five six seven eight nine ten eleven'] },
      'too long',
    ],
    [{ campaignId: 1, keywords: Array.from({ length: 101 }, (_, i) => `k${i}`) }, 'At most 100'],
    [
      { campaignId: 1, keywords: [{ text: 'x', matchType: 'NEGATIVE' }] },
      'matchType must be one of',
    ],
  ])('rejects %j before any request', async (args, text) => {
    const fetchMock = mockFetch();
    const result = await callTool('add-negative-keywords', { customerId: CUSTOMER, ...args });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).toContain(text);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
