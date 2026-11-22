import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerListNotificationsTool(app: AgentApp): void {
  app.tool('homey-list-notifications', {
    description: 'List notifications from Homey (alerts, warnings, system messages).',
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
        const notifications = await api.notifications.getNotifications();

        const notifList = Object.values(notifications).map((notif: any) => ({
          id: notif.id,
          excerpt: notif.excerpt,
          dateCreated: notif.dateCreated,
          ownerUri: notif.ownerUri,
        }));

        return notifList;
      });
    },
  });
}
