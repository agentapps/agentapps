import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseDeal, wrap } from './_helpers.js';

export function registerCreateDealTool(app: AgentApp): void {
  app.tool('create-deal', {
    description:
      'Create a deal. Required: title, value (in major units), pipelineId, stageId, ownerId. value is converted to cents internally. Returns { deal }.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        value: { type: 'number' },
        currency: { type: 'string' },
        contactId: { type: 'string' },
        pipelineId: { type: 'string' },
        stageId: { type: 'string' },
        ownerId: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['title', 'value', 'pipelineId', 'stageId', 'ownerId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      if (!(args as any).title?.trim()) throw new Error('title is required');
      if (!Number.isFinite((args as any).value)) throw new Error('value must be a finite number');
      if ((args as any).value < 0) throw new Error('value must be a non-negative number');
      if (!(args as any).pipelineId?.trim()) throw new Error('pipelineId is required');
      if (!(args as any).stageId?.trim()) throw new Error('stageId is required');
      if (!(args as any).ownerId?.trim()) throw new Error('ownerId is required');
      const cents = Math.round((args as any).value * 100);
      const body: Record<string, unknown> = {
        title: (args as any).title.trim(),
        value: cents,
        currency: ((args as any).currency ?? 'usd').toLowerCase(),
        group: (args as any).pipelineId,
        stage: (args as any).stageId,
        owner: (args as any).ownerId,
      };
      if ((args as any).contactId) body.contact = (args as any).contactId;
      if ((args as any).description) body.description = (args as any).description;
      const raw = (await acRequest(ctx, '/deals', {
        method: 'POST',
        body: { deal: body },
      })) as { deal?: unknown };
      return wrap({ deal: parseDeal(raw.deal) });
    },
  });
}
