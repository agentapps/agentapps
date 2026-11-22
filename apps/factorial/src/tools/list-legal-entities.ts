import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerListLegalEntitiesTool(app: AgentApp): void {
  app.tool('list-legal-entities', {
    description: 'List all company legal entities.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return factorialRequest(ctx, '/companies/legal_entities');
    },
  });
}
