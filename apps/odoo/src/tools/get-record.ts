import type { AgentApp } from '@agentapps/sdk';
import { odooRead } from '../lib/odoo-client.js';

/**
 * get-record — read a single Odoo record by model and ID.
 */
export function registerGetRecordTool(app: AgentApp): void {
  app.tool('get-record', {
    description: 'Read a single Odoo record by model and ID.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        id: { type: 'number', description: 'Record ID' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return',
        },
      },
      required: ['model', 'id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooRead(ctx, a.model as string, a.id as number, a.fields as string[] | undefined);
    },
  });
}
