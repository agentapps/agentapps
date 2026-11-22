import type { AgentApp } from '@agentapps/sdk';
import { odooSearchCount, parseFilters } from '../lib/odoo-client.js';

/**
 * count-records — count records in an Odoo model matching the given filters.
 */
export function registerCountRecordsTool(app: AgentApp): void {
  app.tool('count-records', {
    description: 'Count records in an Odoo model matching the given filters.',
    parameters: {
      type: 'object',
      properties: {
        model: { type: 'string', description: 'Odoo model technical name' },
        filters: {
          type: 'string',
          description: 'Comma-separated filters: field=value, field!=value, etc.',
        },
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
      return odooSearchCount(ctx, a.model as string, parseFilters(a.filters as string | undefined));
    },
  });
}
