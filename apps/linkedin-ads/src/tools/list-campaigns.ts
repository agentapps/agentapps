import type { AgentApp } from '@agentapps/sdk';
import {
  type Args,
  ensureSize,
  enumList,
  idList,
  numericId,
  pageSize,
  pageToken,
} from '../lib/args.js';
import { apiRequest, plain, restliList, urn } from '../lib/client.js';
import { type SearchResponse, shapeCampaign } from '../lib/shape.js';

const STATUSES = [
  'ACTIVE',
  'PAUSED',
  'DRAFT',
  'COMPLETED',
  'ARCHIVED',
  'CANCELED',
  'PENDING_DELETION',
  'REMOVED',
] as const;
const DEFAULT_STATUSES = ['ACTIVE', 'PAUSED', 'DRAFT'] as const;

export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      'List the campaigns of one LinkedIn ad account, optionally only those in some campaign ' +
      'groups. Returns { campaigns: [{ id, name, status, servingStatuses, campaignGroupId, ' +
      'type, format, objectiveType, costType, optimizationTargetType, dailyBudget, ' +
      'totalBudget, unitCost, runSchedule, test }], count, nextPageToken }. Budgets and bids ' +
      'are { amount, currencyCode }; dates are ISO 8601 UTC. By default lists ACTIVE, PAUSED ' +
      'and DRAFT campaigns (add COMPLETED for finished ones). Max 50 per page. Use get-campaign ' +
      'for targeting, get-ad-analytics for performance.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        campaignGroupIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          maxItems: 20,
          description: 'Only campaigns in these campaign groups (ids from list-campaign-groups).',
        },
        status: {
          type: 'array',
          items: { type: 'string', enum: [...STATUSES] },
          description: 'Only campaigns with these statuses (default ACTIVE, PAUSED, DRAFT).',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Campaigns per page (default 25, max 50).',
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
      const groupIds = idList(a.campaignGroupIds, 'campaignGroupIds', 'sponsoredCampaignGroup', 20);
      const requested = enumList(a.status, 'status', STATUSES);
      const status = requested.length > 0 ? requested : [...DEFAULT_STATUSES];
      const size = pageSize(a.pageSize, 25, 50);
      const token = pageToken(a.pageToken);

      const criteria = [`status:(values:${restliList(status)})`];
      if (groupIds.length > 0) {
        const urns = groupIds.map((id) => urn('sponsoredCampaignGroup', id));
        criteria.push(`campaignGroup:(values:${restliList(urns)})`);
      }

      const response = await apiRequest<SearchResponse>(
        'GET',
        `/adAccounts/${accountId}/adCampaigns`,
        ctx,
        {
          query: [
            ['q', 'search'],
            ['search', `(${criteria.join(',')})`],
            ['pageSize', plain(size)],
            ['pageToken', token ? plain(token) : undefined],
          ],
          scope: 'r_ads',
        },
      );
      const campaigns = (response.elements ?? []).map(shapeCampaign);
      return ensureSize(
        {
          campaigns,
          count: campaigns.length,
          nextPageToken: response.metadata?.nextPageToken ?? null,
        },
        'Lower pageSize.',
      );
    },
  });
}
