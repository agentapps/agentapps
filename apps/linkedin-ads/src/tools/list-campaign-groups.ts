import type { AgentApp } from '@agentapps/sdk';
import { type Args, ensureSize, enumList, numericId, pageSize, pageToken } from '../lib/args.js';
import { apiRequest, plain, restliList } from '../lib/client.js';
import { type SearchResponse, shapeCampaignGroup } from '../lib/shape.js';

const STATUSES = [
  'ACTIVE',
  'PAUSED',
  'DRAFT',
  'ARCHIVED',
  'CANCELED',
  'PENDING_DELETION',
  'REMOVED',
] as const;
const DEFAULT_STATUSES = ['ACTIVE', 'PAUSED', 'DRAFT'] as const;

export function registerListCampaignGroupsTool(app: AgentApp): void {
  app.tool('list-campaign-groups', {
    description:
      'List the campaign groups of one LinkedIn ad account. Returns { campaignGroups: [{ id, ' +
      'name, status, servingStatuses, objectiveType, totalBudget, dailyBudget, ' +
      'budgetOptimizationStrategy, runSchedule, backfilled, test }], count, nextPageToken }. ' +
      'Budgets are { amount, currencyCode } in the account currency; dates are ISO 8601 UTC. ' +
      'By default lists ACTIVE, PAUSED and DRAFT groups. Max 100 per page.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description:
            'Ad account id from list-ad-accounts (digits, or urn:li:sponsoredAccount:<id>).',
        },
        status: {
          type: 'array',
          items: { type: 'string', enum: [...STATUSES] },
          description: 'Only groups with these statuses (default ACTIVE, PAUSED, DRAFT).',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Groups per page (default 50, max 100).',
        },
        pageToken: { type: 'string', description: 'nextPageToken from the previous call.' },
      },
      required: ['accountId'],
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
      const accountId = numericId(a.accountId, 'accountId', 'sponsoredAccount');
      const requested = enumList(a.status, 'status', STATUSES);
      const status = requested.length > 0 ? requested : [...DEFAULT_STATUSES];
      const size = pageSize(a.pageSize, 50, 100);
      const token = pageToken(a.pageToken);

      const response = await apiRequest<SearchResponse>(
        'GET',
        `/adAccounts/${accountId}/adCampaignGroups`,
        ctx,
        {
          query: [
            ['q', 'search'],
            ['search', `(status:(values:${restliList(status)}))`],
            ['pageSize', plain(size)],
            ['pageToken', token ? plain(token) : undefined],
          ],
          scope: 'r_ads',
        },
      );
      const campaignGroups = (response.elements ?? []).map(shapeCampaignGroup);
      return ensureSize(
        {
          campaignGroups,
          count: campaignGroups.length,
          nextPageToken: response.metadata?.nextPageToken ?? null,
        },
        'Lower pageSize.',
      );
    },
  });
}
