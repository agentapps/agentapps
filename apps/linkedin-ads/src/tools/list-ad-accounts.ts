import type { AgentApp } from '@agentapps/sdk';
import {
  type Args,
  ensureSize,
  enumList,
  optionalBoolean,
  pageSize,
  pageToken,
} from '../lib/args.js';
import { apiRequest, plain, restliList } from '../lib/client.js';
import { type SearchResponse, shapeAccount } from '../lib/shape.js';

const STATUSES = ['ACTIVE', 'CANCELED', 'DRAFT', 'PENDING_DELETION', 'REMOVED'] as const;

export function registerListAdAccountsTool(app: AgentApp): void {
  app.tool('list-ad-accounts', {
    description:
      'List the LinkedIn ad accounts the connected member can access. Returns { accounts: ' +
      '[{ id, name, status, type, currency, servingStatuses, reference, test }], count, ' +
      'nextPageToken }. servingStatuses explains why an account does not serve (BILLING_HOLD, ' +
      '...). Start here: every other tool takes an accountId from this list. Max 100 per page; ' +
      'pass nextPageToken back as pageToken for the next page.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'array',
          items: { type: 'string', enum: [...STATUSES] },
          description: 'Only accounts with these statuses. Omit for every status.',
        },
        test: {
          type: 'boolean',
          description: 'true: only test accounts; false: only real accounts. Omit for both.',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Accounts per page (default 50, max 100).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const status = enumList(a.status, 'status', STATUSES);
      const test = optionalBoolean(a.test, 'test');
      const size = pageSize(a.pageSize, 50, 100);
      const token = pageToken(a.pageToken);

      const criteria: string[] = [];
      if (status.length > 0) criteria.push(`status:(values:${restliList(status)})`);
      if (test !== undefined) criteria.push(`test:${test}`);

      const response = await apiRequest<SearchResponse>('GET', '/adAccounts', ctx, {
        query: [
          ['q', 'search'],
          ['search', criteria.length > 0 ? `(${criteria.join(',')})` : undefined],
          ['pageSize', plain(size)],
          ['pageToken', token ? plain(token) : undefined],
        ],
        scope: 'r_ads',
      });
      const accounts = (response.elements ?? []).map(shapeAccount);
      return ensureSize(
        {
          accounts,
          count: accounts.length,
          nextPageToken: response.metadata?.nextPageToken ?? null,
        },
        'Lower pageSize.',
      );
    },
  });
}
