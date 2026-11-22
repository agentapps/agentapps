import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetMembersTool(app: AgentApp): void {
  app.tool('get-members', {
    description: 'Get all members of a ClickUp workspace.',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'The workspace (team) ID' },
      },
      required: ['workspaceId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { workspaceId } = args as { workspaceId: string };
      const data = (await clickupRequest(ctx, '/team')) as { teams: any[] };

      const workspace = data.teams.find((t) => t.id === workspaceId);
      if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

      return {
        workspaceId,
        workspaceName: workspace.name,
        memberCount: workspace.members?.length ?? 0,
        members: workspace.members?.map((m: any) => ({
          id: m.user.id,
          username: m.user.username,
          email: m.user.email,
          color: m.user.color,
          role: m.role,
          profilePicture: m.user.profilePicture,
        })),
      };
    },
  });
}
