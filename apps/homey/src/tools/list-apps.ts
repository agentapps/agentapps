import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerListAppsTool(app: AgentApp): void {
  app.tool('homey-list-apps', {
    description:
      'List all apps installed on Homey. Useful for diagnostics and checking which integrations are active.',
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
        const apps = await api.apps.getApps();

        const appList = Object.values(apps).map((a: any) => ({
          id: a.id,
          name: a.name,
          version: a.version,
          enabled: a.enabled,
          origin: a.origin,
          channel: a.channel,
          autoupdate: a.autoupdate,
        }));

        return appList;
      });
    },
  });
}
