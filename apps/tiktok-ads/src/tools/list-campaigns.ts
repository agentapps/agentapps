import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { listEntities } from '../lib/entities.js';
import { advertiserIdSchema, idListSchema, listPagingSchema } from '../lib/schemas.js';

export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      'List the campaigns of one TikTok ad account, one page at a time. Returns { campaigns: ' +
      '[{ campaignId, name, objectiveType, operationStatus (ENABLE or DISABLE), secondaryStatus, ' +
      'budget, budgetMode, createTime, modifyTime }], page, pageSize, totalNumber, totalPage, ' +
      'hasMore }. Budget is in the account currency; budgetMode BUDGET_MODE_INFINITE means no ' +
      'campaign budget. For spend and results use get-report.',
    parameters: {
      type: 'object',
      properties: {
        advertiserId: advertiserIdSchema,
        campaignIds: idListSchema('campaign'),
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
    handler: async (args, ctx) => listEntities(ctx, 'campaign', (args ?? {}) as Args),
  });
}
