import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { listEntities } from '../lib/entities.js';
import { advertiserIdSchema, idListSchema, listPagingSchema } from '../lib/schemas.js';

export function registerListAdsTool(app: AgentApp): void {
  app.tool('list-ads', {
    description:
      'List the ads of one TikTok ad account, optionally only those of some campaigns or ad ' +
      'groups. Returns { ads: [{ adId, name, adgroupId, campaignId, operationStatus, ' +
      'secondaryStatus, adFormat, adText, landingPageUrl, createTime, modifyTime }], page, ' +
      'pageSize, totalNumber, totalPage, hasMore }.',
    parameters: {
      type: 'object',
      properties: {
        advertiserId: advertiserIdSchema,
        campaignIds: idListSchema('campaign'),
        adgroupIds: idListSchema('ad group'),
        adIds: idListSchema('ad'),
        ...listPagingSchema,
      },
      required: ['advertiserId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => listEntities(ctx, 'ad', (args ?? {}) as Args),
  });
}
