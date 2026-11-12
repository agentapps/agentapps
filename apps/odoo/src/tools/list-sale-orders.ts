import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-sale-orders — list Odoo sales orders.
 */
export function registerListSaleOrdersTool(app: AgentApp): void {
  app.tool('list-sale-orders', {
    description: 'List Odoo sales orders.',
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'string', description: 'Comma-separated filters, e.g. state=sale' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. date_order desc' },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return odooSearchRead(ctx, 'sale.order', {
        domain: parseFilters(a.filters as string | undefined),
        fields: ['id', 'name', 'partner_id', 'date_order', 'amount_total', 'state', 'user_id'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
