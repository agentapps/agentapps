import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetWorkspacesTool(app: AgentApp): void {
  app.tool('get-workspaces', {
    description: 'Get all ClickUp workspaces (teams) the user belongs to.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const data = (await clickupRequest(ctx, '/team')) as { teams: any[] };
      return {
        workspaces: data.teams.map((team) => ({
          id: team.id,
          name: team.name,
          color: team.color,
          avatar: team.avatar,
          memberCount: team.members?.length ?? 0,
        })),
      };
    },
  });
}
