import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { wrap } from './_helpers.js';

export function registerDeleteContactTool(app: AgentApp): void {
  app.tool('delete-contact', {
    description:
      'Delete a contact by id. Permanent — no soft-delete in ActiveCampaign. Returns { id, deleted: true }.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      if (!(args as any).id?.trim()) throw new Error('id is required');
      await acRequest(ctx, `/contacts/${encodeURIComponent((args as any).id)}`, {
        method: 'DELETE',
      });
      return wrap({ id: (args as any).id, deleted: true });
    },
  });
}
