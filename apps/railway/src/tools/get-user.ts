import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * get-user — Get current Railway user info including available workspaces.
 */
export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description: 'Get current Railway user info including available workspaces.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const client = await createClient(ctx);
      const user = await client.getMe();

      let result = `# Railway User\n\n`;
      result += `- **Name**: ${user.name}\n`;
      result += `- **Email**: ${user.email}\n`;
      result += `- **ID**: ${user.id}\n\n`;

      result += `## Workspaces\n`;
      if (user.workspaces.length === 0) {
        result += 'No workspaces found.\n';
      } else {
        for (const ws of user.workspaces) {
          result += `- **${ws.name}** (${ws.id})\n`;
        }
      }

      return result;
    },
  });
}
