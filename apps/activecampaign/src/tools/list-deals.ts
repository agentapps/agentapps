import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { buildPaginated, parseDeal, wrap } from './_helpers.js';

export function registerListDealsTool(app: AgentApp): void {
  app.tool('list-deals', {
    description:
      'List deals (CRM pipeline records). Returns { items[{id,title,value,currency,status,contact,pipeline,stage}], total, nextOffset }.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        pipelineId: { type: 'string' },
        stageId: { type: 'string' },
        status: { type: 'string', enum: ['open', 'won', 'lost'] },
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
      const STATUS_MAP: Record<string, number> = { open: 0, won: 1, lost: 2 };
      const numericStatus = (args as any).status ? STATUS_MAP[(args as any).status] : undefined;
      const searchParams: Record<string, string | number | undefined> = {
        limit,
        offset,
      };
      if ((args as any).search) searchParams['filters[search]'] = (args as any).search;
      if ((args as any).pipelineId) searchParams['filters[group]'] = (args as any).pipelineId;
      if ((args as any).stageId) searchParams['filters[stage]'] = (args as any).stageId;
      if (numericStatus !== undefined) searchParams['filters[status]'] = numericStatus;
      const raw = (await acRequest(ctx, '/deals', { searchParams })) as {
        deals?: unknown[];
        meta?: unknown;
      };
      const items = (raw.deals ?? []).map(parseDeal);
      const data = buildPaginated(items, raw.meta, offset, limit);
      return wrap({
        deals: data.items,
        total: data.total,
        nextOffset: data.nextOffset,
      });
    },
  });
}
