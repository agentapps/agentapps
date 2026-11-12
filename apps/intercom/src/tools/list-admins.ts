import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * list-admins — GET /admins.
 */
export function registerListAdminsTool(app: AgentApp): void {
  app.tool('list-admins', {
    description:
      'List all admins (agents) in the Intercom workspace with their IDs, names, emails, and seat status.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const result = await intercomRequest<Record<string, unknown>>(ctx, '/admins');
      const admins = (result.admins as Array<Record<string, unknown>>) ?? [];
      return {
        count: admins.length,
        admins: admins.map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          hasInboxSeat: a.has_inbox_seat,
          type: a.type,
        })),
      };
    },
  });
}
