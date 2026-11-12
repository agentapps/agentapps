import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerGetUserTool(app: AgentApp): void {
  app.tool('homey-get-user', {
    description: 'Get authenticated user information from Homey.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);
        const user = await api.users.getUsers();
        return user;
      });
    },
  });
}
