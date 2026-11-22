import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-agents — GET /agents
 *
 * Lists all agents (support staff) in the Freshdesk helpdesk.
 */
export function registerListAgentsTool(app: AgentApp): void {
  app.tool('list-agents', {
    description:
      'List Freshdesk agents / support staff (GET /api/v2/agents). Optional filters: email, page, per_page. Returns agent id, name, email, contact details, and role information.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Filter agents by email address.',
        },
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.email !== undefined) params.email = a.email;
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const agents = await freshdeskRequest<unknown[]>(
        'GET',
        '/agents',
        hasParams ? params : undefined,
        ctx,
      );

      return { count: agents.length, agents };
    },
  });
}
