import type { AgentApp } from '@agentapps/sdk';
import { getPlaudClient, mapUser } from '../lib/index.js';

export function registerGetCurrentUserTool(app: AgentApp): void {
  app.tool('get-current-user', {
    description:
      'Get the current PLAUD user profile (id, email, name). Useful for health checks and confirming OAuth connectivity.',
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
      const client = await getPlaudClient(ctx);
      const raw = (await client.getCurrentUser()) as Record<string, unknown>;
      const user = mapUser(raw);
      return { user };
    },
  });
}
