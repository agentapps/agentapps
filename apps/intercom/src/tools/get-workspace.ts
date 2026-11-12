import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * get-workspace — GET /me.
 */
export function registerGetWorkspaceTool(app: AgentApp): void {
  app.tool('get-workspace', {
    description:
      'Get information about the connected Intercom workspace: name, region, timezone, and the authenticated admin.',
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
      const me = await intercomRequest<Record<string, unknown>>(ctx, '/me');
      return {
        admin: {
          id: me.id,
          name: me.name,
          email: me.email,
        },
        workspace: {
          id: (me.app as Record<string, unknown> | undefined)?.id_code,
          name: (me.app as Record<string, unknown> | undefined)?.name,
          timezone: (me.app as Record<string, unknown> | undefined)?.timezone,
          region: (me.app as Record<string, unknown> | undefined)?.region,
          createdAt: (me.app as Record<string, unknown> | undefined)?.created_at,
        },
      };
    },
  });
}
