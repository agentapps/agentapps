import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateInviteTool(app: AgentApp): void {
  app.tool('update-invite', {
    description:
      'Update an existing Excalidraw Plus workspace invite (e.g. change the assigned role).',
    parameters: {
      type: 'object',
      properties: {
        inviteId: {
          type: 'string',
          description: 'The invite ID to update.',
        },
        role: {
          type: 'string',
          description: 'New role to assign to the invitee.',
        },
      },
      required: ['inviteId', 'role'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.updateInvite(args.inviteId as string, { role: args.role as string });
    },
  });
}
