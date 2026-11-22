import type { AgentApp } from '@agentapps/sdk';
import { odooSearchRead, parseFilters } from '../lib/odoo-client.js';

/**
 * list-tasks — list Odoo project tasks.
 */
export function registerListTasksTool(app: AgentApp): void {
  app.tool('list-tasks', {
    description: 'List Odoo project tasks.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Filter by project ID' },
        filters: { type: 'string', description: 'Additional comma-separated filters' },
        limit: { type: 'number', description: 'Maximum results (default: 50)' },
        offset: { type: 'number', description: 'Pagination offset' },
        order: { type: 'string', description: 'Order clause, e.g. date_deadline asc' },
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
      const domain = parseFilters(a.filters as string | undefined);
      if (a.projectId) {
        domain.push(['project_id', '=', a.projectId as number]);
      }

      return odooSearchRead(ctx, 'project.task', {
        domain,
        fields: ['id', 'name', 'project_id', 'user_ids', 'stage_id', 'date_deadline', 'state'],
        limit: a.limit as number | undefined,
        offset: a.offset as number | undefined,
        order: a.order as string | undefined,
      });
    },
  });
}
