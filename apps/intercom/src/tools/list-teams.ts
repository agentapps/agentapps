import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * list-teams — GET /teams.
 */
export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list-teams', {
    description:
      'List all teams in the Intercom workspace with their IDs, names, and member counts.',
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
      const result = await intercomRequest<Record<string, unknown>>(ctx, '/teams');
      const teams = (result.teams as Array<Record<string, unknown>>) ?? [];
      return {
        count: teams.length,
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          adminIds: (t.admin_ids as unknown[]) ?? [],
          memberCount: ((t.admin_ids as unknown[]) ?? []).length,
        })),
      };
    },
  });
}
