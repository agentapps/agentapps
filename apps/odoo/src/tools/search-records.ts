import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * search-records — search and read records from any Odoo model.
 */
export function registerSearchRecordsTool(app: AgentApp): void {
  app.tool('search-records', {
    description:
      'Search and read records from any Odoo model. Use filters like "is_company=true,name=Acme".',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name, e.g. res.partner' },
        filters: {
          type: 'string',
          description: 'Comma-separated filters: field=value, field!=value, field>value, etc.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to return (default: all stored fields)',
        },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. name asc' },
      },
      required: ['model'],
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
      return odooSearchRead(ctx, a.model as string, {
        domain: parseFilters(a.filters as string | undefined),
        fields: a.fields as string[] | undefined,
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
