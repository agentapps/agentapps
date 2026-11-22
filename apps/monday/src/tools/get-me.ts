import type { AgentApp } from '@agentapps/sdk';
import { mondayRequest } from '../lib/monday-client.js';

/**
 * get-me -- Get information about the authenticated user.
 */
export function registerGetMeTool(app: AgentApp): void {
  app.tool('get-me', {
    description:
      'Get information about the authenticated Monday.com user. Returns { id, name, email }.',
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
      const query = `query { me { id name email } }`;
      const result = await mondayRequest(ctx, query);
      return result.me;
    },
  });
}
