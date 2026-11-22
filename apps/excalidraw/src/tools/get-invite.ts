import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetInviteTool(app: AgentApp): void {
  app.tool('get-invite', {
    description: 'Get details for a specific Excalidraw Plus workspace invite by its ID.',
    parameters: {
      type: 'object',
      properties: {
        inviteId: {
          type: 'string',
          description: 'The invite ID to retrieve.',
        },
      },
      required: ['inviteId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.getInvite(args.inviteId as string);
    },
  });
}
