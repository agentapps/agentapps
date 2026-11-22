import type { AgentApp } from '@agentapps/sdk';
import { odooCallMethod } from '../lib/odoo-client.js';

/**
 * list-models — list all available Odoo models (ir.model).
 */
export function registerListModelsTool(app: AgentApp): void {
  app.tool('list-models', {
    description: 'List all available Odoo models (ir.model).',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of results (default: 100)' },
        offset: { type: 'number', description: 'Pagination offset' },
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
      return odooCallMethod(ctx, 'ir.model', 'search_read', [[], ['model', 'name']], {
        limit: typeof a.limit === 'number' ? a.limit : 100,
        offset: typeof a.offset === 'number' ? a.offset : 0,
        order: 'model asc',
      });
    },
  });
}
