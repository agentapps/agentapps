import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerRemoveUserTool(app: AgentApp): void {
  app.tool('remove-user', {
    description: 'Remove a user from the Excalidraw Plus workspace. This revokes their access.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The user ID to remove from the workspace.',
        },
      },
      required: ['userId'],
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
      await client.removeUser(args.userId as string);
      return { success: true, userId: args.userId, message: 'User removed from workspace.' };
    },
  });
}
