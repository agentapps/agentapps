import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerGetSystemInfoTool(app: AgentApp): void {
  app.tool('homey-get-system-info', {
    description:
      'Get Homey system information including firmware version, model, uptime, Wi-Fi status, and more.',
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
        const info = await api.system.getInfo();
        return info;
      });
    },
  });
}
