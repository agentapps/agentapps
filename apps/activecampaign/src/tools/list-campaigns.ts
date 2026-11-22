import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { buildPaginated, parseCampaign, wrap } from './_helpers.js';

export function registerListCampaignsTool(app: AgentApp): void {
  app.tool('list-campaigns', {
    description:
      'List email campaigns. Returns { items[{id,name,type,status,subject,sendDate,totalRecipients,totalOpens,uniqueOpens}], total, nextOffset }.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: [],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max((args as any).limit ?? 20, 1), 100);
      const offset = Math.max((args as any).offset ?? 0, 0);
      const raw = (await acRequest(ctx, '/campaigns', {
        searchParams: { limit, offset, orders: 'sdate', direction: 'DESC' },
      })) as { campaigns?: unknown[]; meta?: unknown };
      const items = (raw.campaigns ?? []).map(parseCampaign);
      const data = buildPaginated(items, raw.meta, offset, limit);
      return wrap({
        campaigns: data.items,
        total: data.total,
        nextOffset: data.nextOffset,
      });
    },
  });
}
