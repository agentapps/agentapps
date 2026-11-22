import type { AgentApp } from '@agentapps/sdk';
import { getExcalidrawClient } from '../lib/index.js';

export function registerCreateInviteTool(app: AgentApp): void {
  app.tool('create-invite', {
    description:
      'Invite a user to the Excalidraw Plus workspace by email. Optionally specify their role.',
    parameters: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Email address of the person to invite.',
        },
        role: {
          type: 'string',
          description: 'Role to assign (e.g. "admin", "member"). Defaults to workspace default.',
        },
      },
      required: ['email'],
    },
    // An invite reaches another person by email; delete-invite revokes it but cannot unsend it.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getExcalidrawClient(ctx);
      return client.createInvite({
        email: args.email as string,
        role: args.role as string | undefined,
      });
    },
  });
}
