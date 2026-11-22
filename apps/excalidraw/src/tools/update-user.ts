import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerUpdateUserTool(app: AgentApp): void {
  app.tool('update-user', {
    description: 'Update a workspace user in Excalidraw Plus (e.g. change their role).',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The user ID to update.',
        },
        role: {
          type: 'string',
          description: 'New role for the user (e.g. "admin", "member").',
        },
        name: {
          type: 'string',
          description: 'New display name for the user.',
        },
      },
      required: ['userId'],
    },
    // Changes another person's role or name; setting the fields again undoes it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      const payload: { role?: string; name?: string } = {};
      if (args.role !== undefined) payload.role = args.role as string;
      if (args.name !== undefined) payload.name = args.name as string;
      return client.updateUser(args.userId as string, payload);
    },
  });
}
