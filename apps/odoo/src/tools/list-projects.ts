import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-projects — list Odoo projects.
 */
export function registerListProjectsTool(app: AgentApp): void {
  app.tool('list-projects', {
    description: 'List Odoo projects.',
    parameters: {
      type: 'object',
      properties: {
        filters: { type: 'string', description: 'Comma-separated filters' },
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
      return odooSearchRead(ctx, 'project.project', {
        domain: parseFilters(a.filters as string | undefined),
        fields: ['id', 'name', 'partner_id', 'user_id', 'date_start', 'date'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
