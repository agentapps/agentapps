import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-groups — GET /groups
 *
 * Lists all agent groups in the Freshdesk helpdesk.
 */
export function registerListGroupsTool(app: AgentApp): void {
  app.tool('list-groups', {
    description:
      'List Freshdesk agent groups (GET /api/v2/groups). Optional pagination: page, per_page. Returns group id, name, description, agent IDs, and other settings.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (default 30, max 100).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const groups = await freshdeskRequest<unknown[]>(
        'GET',
        '/groups',
        hasParams ? params : undefined,
        ctx,
      );

      return { count: groups.length, groups };
    },
  });
}
