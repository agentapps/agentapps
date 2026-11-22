import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseDeal, wrap } from './_helpers.js';

export function registerGetDealTool(app: AgentApp): void {
  app.tool('get-deal', {
    description:
      'Get a deal by id. Returns { deal: {id,title,description,value,currency,status,contact,pipeline,stage,owner} }.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      if (!(args as any).id?.trim()) throw new Error('id is required');
      const raw = (await acRequest(ctx, `/deals/${encodeURIComponent((args as any).id)}`)) as {
        deal?: unknown;
      };
      return wrap({ deal: parseDeal(raw.deal) });
    },
  });
}
