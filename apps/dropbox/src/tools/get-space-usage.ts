import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerGetSpaceUsageTool(app: AgentApp): void {
  app.tool('get-space-usage', {
    description:
      'Get the storage space usage and quota information for the authenticated Dropbox account.',
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
      const result = await dropboxRequest('users/get_space_usage', null, ctx);

      return result;
    },
  });
}
