import type { AgentApp } from '@agentapps/sdk';
import { odooWrite } from '../lib/odoo-client.js';

/**
 * update-partner — update an existing Odoo partner by ID.
 */
export function registerUpdatePartnerTool(app: AgentApp): void {
  app.tool('update-partner', {
    description: 'Update an existing Odoo partner by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Partner ID' },
        values: {
          type: 'object',
          description: 'Field values to update',
          additionalProperties: true,
        },
      },
      required: ['id', 'values'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooWrite(ctx, 'res.partner', a.id as number, a.values as Record<string, unknown>);
    },
  });
}
