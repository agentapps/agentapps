import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-partners — list Odoo partners (contacts / companies).
 */
export function registerListPartnersTool(app: AgentApp): void {
  app.tool('list-partners', {
    description: 'List Odoo partners (contacts / companies).',
    parameters: {
      type: 'object',
      properties: {
        filters: {
          type: 'string',
          description: 'Comma-separated filters, e.g. is_company=true,name=Acme',
        },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. name asc' },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return odooSearchRead(ctx, 'res.partner', {
        domain: parseFilters(a.filters as string | undefined),
        fields: ['id', 'name', 'email', 'phone', 'is_company', 'parent_id', 'user_id'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
