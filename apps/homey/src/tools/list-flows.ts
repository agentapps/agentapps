import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerListFlowsTool(app: AgentApp): void {
  app.tool('homey-list-flows', {
    description: 'List all flows (automations) configured in Homey.',
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
        const flows = await api.flow.getFlows();

        const flowList = Object.values(flows).map((flow: any) => ({
          id: flow.id,
          name: flow.name,
          enabled: flow.enabled,
          folder: flow.folder,
        }));

        return flowList;
      });
    },
  });
}
