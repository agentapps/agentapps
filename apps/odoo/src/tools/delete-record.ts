import type { AgentApp } from '@agentapps/sdk';
import { odooUnlink } from '../lib/odoo-client.js';

/**
 * delete-record — delete an Odoo record by model and ID.
 */
export function registerDeleteRecordTool(app: AgentApp): void {
  app.tool('delete-record', {
    description: 'Delete an Odoo record by model and ID.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        id: { type: 'number', description: 'Record ID' },
      },
      required: ['model', 'id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooUnlink(ctx, a.model as string, a.id as number);
    },
  });
}
