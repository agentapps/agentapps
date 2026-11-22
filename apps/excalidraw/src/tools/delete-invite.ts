import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerDeleteInviteTool(app: AgentApp): void {
  app.tool('delete-invite', {
    description: 'Delete a pending Excalidraw Plus workspace invite, revoking the invitation.',
    parameters: {
      type: 'object',
      properties: {
        inviteId: {
          type: 'string',
          description: 'The invite ID to delete.',
        },
      },
      required: ['inviteId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      await client.deleteInvite(args.inviteId as string);
      return { success: true, inviteId: args.inviteId, message: 'Invite deleted.' };
    },
  });
}
