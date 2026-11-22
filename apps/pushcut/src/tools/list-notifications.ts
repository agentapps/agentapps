/**
 * list_notifications — list all notification definitions configured in Pushcut.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, pushcutRequest, resolveApiKey } from '../types.js';

export function registerListNotificationsTool(app: AgentApp): void {
  app.tool('list_notifications', {
    description:
      'List all notification definitions configured in your Pushcut app. ' +
      'Use the returned names with send_notification.',
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
      const apiKey = await resolveApiKey(ctx);

      ctx.log('info', 'Listing notifications');

      const response = await pushcutRequest('/notifications', apiKey);
      await assertOk(response);
      return await response.json();
    },
  });
}
