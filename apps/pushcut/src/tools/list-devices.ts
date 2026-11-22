/**
 * list_devices — list all active iOS devices registered in Pushcut.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, pushcutRequest, resolveApiKey } from '../types.js';

export function registerListDevicesTool(app: AgentApp): void {
  app.tool('list_devices', {
    description: 'List all active iOS devices registered in your Pushcut account.',
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

      ctx.log('info', 'Listing devices');

      const response = await pushcutRequest('/devices', apiKey);
      await assertOk(response);
      return await response.json();
    },
  });
}
