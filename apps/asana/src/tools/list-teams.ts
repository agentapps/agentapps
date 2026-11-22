import type { AgentApp } from '@agentapps/sdk';
import { asanaRequest } from '../lib/asana-client.js';

/**
 * list-teams — GET /organizations/{workspaceId}/teams.
 */
export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list-teams', {
    description:
      'List teams in an Asana organization (GET /organizations/{workspaceId}/teams). Returns an array of teams with gid and name. Params: workspaceId (required — must be an organization workspace).',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'The organization workspace GID (required).',
        },
      },
      required: ['workspaceId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const teams = await asanaRequest<unknown[]>(ctx, `organizations/${a.workspaceId}/teams`);
      return { teams };
    },
  });
}
