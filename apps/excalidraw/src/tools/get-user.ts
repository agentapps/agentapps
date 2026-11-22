import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description:
      'Get details for a specific user in the Excalidraw Plus workspace by their user ID.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The user ID to retrieve.',
        },
      },
      required: ['userId'],
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
      return client.getUser(args.userId as string);
    },
  });
}
