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
import { type SearchResponse, shapeCreative } from '../lib/shape.js';

const STATUSES = [
  'ACTIVE',
  'PAUSED',
  'DRAFT',
  'ARCHIVED',
  'CANCELED',
  'PENDING_DELETION',
  'REMOVED',
] as const;

export function registerListCreativesTool(app: AgentApp): void {
  app.tool('list-creatives', {
    description:
      'List the creatives (ads) of one LinkedIn ad account, optionally only those of some ' +
      'campaigns or intended statuses. Returns { creatives: [{ id, urn, name, campaignId, ' +
      'intendedStatus, isServing, servingHoldReasons, reviewStatus, contentReference, ' +
      'createdAt, lastModifiedAt, test }], count, nextPageToken }. isServing and ' +
      'servingHoldReasons say whether the ad really runs (a PAUSED campaign stops its ' +
      'creatives too). contentReference is the sponsored post URN. Max 100 per page.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: ['string', 'number'],
          description: 'Ad account id from list-ad-accounts.',
        },
        campaignIds: {
          type: 'array',
          items: { type: ['string', 'number'] },
          maxItems: 20,
          description: 'Only creatives of these campaigns (ids from list-campaigns).',
        },
        intendedStatus: {
          type: 'array',
          items: { type: 'string', enum: [...STATUSES] },
          description: 'Only creatives with these intended statuses. Omit for all.',
        },
        pageSize: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Creatives per page (default 50, max 100).',
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
      const campaignIds = idList(a.campaignIds, 'campaignIds', 'sponsoredCampaign', 20);
      const statuses = enumList(a.intendedStatus, 'intendedStatus', STATUSES);
      const size = pageSize(a.pageSize, 50, 100);
      const token = pageToken(a.pageToken);

      const response = await apiRequest<SearchResponse>(
        'GET',
        `/adAccounts/${accountId}/creatives`,
        ctx,
        {
          query: [
            ['q', 'criteria'],
            [
              'campaigns',
              campaignIds.length > 0
                ? restliList(campaignIds.map((id) => urn('sponsoredCampaign', id)))
                : undefined,
            ],
            ['intendedStatuses', statuses.length > 0 ? restliList(statuses) : undefined],
            ['sortOrder', 'ASCENDING'],
            ['pageSize', plain(size)],
            ['pageToken', token ? plain(token) : undefined],
          ],
          // LinkedIn's creatives search documents this header as required.
          headers: { 'X-RestLi-Method': 'FINDER' },
          scope: 'r_ads',
        },
      );
      const creatives = (response.elements ?? []).map(shapeCreative);
      return ensureSize(
        {
          creatives,
          count: creatives.length,
          nextPageToken: response.metadata?.nextPageToken ?? null,
        },
        'Lower pageSize.',
      );
    },
  });
}
