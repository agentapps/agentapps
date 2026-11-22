import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-invoices — list Odoo customer invoices (account.move).
 */
export function registerListInvoicesTool(app: AgentApp): void {
  app.tool('list-invoices', {
    description: 'List Odoo customer invoices (account.move).',
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'string', description: 'Comma-separated filters, e.g. state=posted' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. invoice_date desc' },
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
      return odooSearchRead(ctx, 'account.move', {
        domain: [
          ['move_type', 'in', ['out_invoice', 'out_refund']],
          ...parseFilters(a.filters as string | undefined),
        ],
        fields: [
          'id',
          'name',
          'partner_id',
          'invoice_date',
          'amount_total',
          'state',
          'payment_state',
        ],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
