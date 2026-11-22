/**
 * list-teams — list teams the authenticated user belongs to.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list-teams', {
    description: 'List all teams the authenticated Vercel user belongs to.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of teams to return (default 20).',
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
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };

      const data = (await vercelRequest('GET', '/v2/teams', { params }, ctx)) as Record<
        string,
        unknown
      >;
      return { teams: data.teams, pagination: data.pagination };
    },
  });
}
