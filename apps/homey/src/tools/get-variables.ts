import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerGetVariablesTool(app: AgentApp): void {
  app.tool('homey-get-variables', {
    description:
      'List all logic variables configured in Homey. Logic variables are used in flows/automations for state tracking.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);
        const variables = await api.logic.getVariables();

        const varList = Object.values(variables).map((v: any) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          value: v.value,
        }));

        return varList;
      });
    },
  });
}
