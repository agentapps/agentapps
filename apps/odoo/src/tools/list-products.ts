import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-products — list Odoo products (product.template).
 */
export function registerListProductsTool(app: AgentApp): void {
  app.tool('list-products', {
    description: 'List Odoo products (product.template).',
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'string', description: 'Comma-separated filters, e.g. sale_ok=true' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. name asc' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return odooSearchRead(ctx, 'product.template', {
        domain: parseFilters(a.filters as string | undefined),
        fields: [
          'id',
          'name',
          'default_code',
          'list_price',
          'standard_price',
          'qty_available',
          'sale_ok',
        ],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
