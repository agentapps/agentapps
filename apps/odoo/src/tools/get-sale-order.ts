import type { AgentApp } from '@agentapps/sdk';
import { odooRead } from '../lib/odoo-client.js';

/**
 * get-sale-order — get a specific Odoo sales order by ID, including order lines.
 */
export function registerGetSaleOrderTool(app: AgentApp): void {
  app.tool('get-sale-order', {
    description: 'Get a specific Odoo sales order by ID, including order lines.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Sales order ID' },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      return odooRead(ctx, 'sale.order', a.id as number, [
        'id',
        'name',
        'partner_id',
        'date_order',
        'amount_total',
        'state',
        'order_line',
        'user_id',
        'note',
      ]);
    },
  });
}
