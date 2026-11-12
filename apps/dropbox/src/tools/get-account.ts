import type { AgentApp } from '@agentapps/sdk';
import { dropboxRequest } from '../lib/dropbox-client.js';

export function registerGetAccountTool(app: AgentApp): void {
  app.tool('get-account', {
    description: 'Get information about the currently authenticated Dropbox user account.',
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
      const result = await dropboxRequest('users/get_current_account', null, ctx);

      return result;
    },
  });
}
