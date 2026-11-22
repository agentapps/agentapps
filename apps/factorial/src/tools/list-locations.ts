import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerListLocationsTool(app: AgentApp): void {
  app.tool('list-locations', {
    description: 'List all company work locations and offices.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return factorialRequest(ctx, '/locations/locations');
    },
  });
}
