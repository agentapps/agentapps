import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerTriggerFlowTool(app: AgentApp): void {
  app.tool('homey-trigger-flow', {
    description: 'Trigger (run) a Homey flow by its ID.',
    parameters: {
      type: 'object',
      properties: {
        flow_id: {
          type: 'string',
          description: 'Flow ID to trigger.',
        },
      },
      required: ['flow_id'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);
        const flow = await api.flow.getFlow({ id: a.flow_id as string });
        await flow.trigger();

        return {
          success: true,
          flow_id: a.flow_id,
          flow_name: flow.name,
          message: 'Flow triggered successfully',
        };
      });
    },
  });
}
