import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetSpacesTool(app: AgentApp): void {
  app.tool('get-spaces', {
    description: 'Get all spaces in a ClickUp workspace.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'The workspace (team) ID' },
        archived: { type: 'boolean', description: 'Include archived spaces (default: false)' },
      },
      required: ['workspaceId'],
    },
    annotations: {
      readOnlyHint: true,
    },
    handler: async (args, ctx) => {
      const { workspaceId, archived = false } = args as { workspaceId: string; archived?: boolean };
      const data = (await clickupRequest(ctx, `/team/${workspaceId}/space`, {
        params: { archived: String(archived) },
      })) as { spaces: any[] };
      return {
        workspaceId,
        spaces: data.spaces.map((space) => ({
          id: space.id,
          name: space.name,
          color: space.color,
          private: space.private,
          archived: space.archived,
          statuses: space.statuses?.map((s: any) => ({
            status: s.status,
            color: s.color,
            type: s.type,
          })),
        })),
      };
    },
  });
}
