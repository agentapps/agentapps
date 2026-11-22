import type { AgentApp } from '@agentapps/sdk';
import { odooRead } from '../lib/odoo-client.js';

/**
 * get-partner — get a specific Odoo partner by ID.
 */
export function registerGetPartnerTool(app: AgentApp): void {
  app.tool('get-partner', {
    description: 'Get a specific Odoo partner by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Partner ID' },
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
      const a = args as Record<string, unknown>;
      return odooRead(ctx, 'res.partner', a.id as number, [
        'id',
        'name',
        'email',
        'phone',
        'mobile',
        'street',
        'city',
        'zip',
        'country_id',
        'is_company',
        'parent_id',
        'user_id',
      ]);
    },
  });
}
