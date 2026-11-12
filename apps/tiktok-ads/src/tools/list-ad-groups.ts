import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { listEntities } from '../lib/entities.js';
import { advertiserIdSchema, idListSchema, listPagingSchema } from '../lib/schemas.js';

export function registerListAdGroupsTool(app: AgentApp): void {
  app.tool('list-ad-groups', {
    description:
      'List the ad groups of one TikTok ad account, optionally only those of some campaigns. ' +
      'Returns { adGroups: [{ adgroupId, name, campaignId, operationStatus, secondaryStatus, ' +
      'budget, budgetMode, optimizationGoal, bidType, bidPrice, billingEvent, scheduleStartTime, ' +
      'scheduleEndTime, createTime, modifyTime }], page, pageSize, totalNumber, totalPage, hasMore }.',
    parameters: {
      type: 'object',
      properties: {
        advertiserId: advertiserIdSchema,
        campaignIds: idListSchema('campaign'),
        adgroupIds: idListSchema('ad group'),
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
    handler: async (args, ctx) => listEntities(ctx, 'adgroup', (args ?? {}) as Args),
  });
}
