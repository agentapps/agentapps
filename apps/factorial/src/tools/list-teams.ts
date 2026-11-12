import type { AgentApp } from '@agentapps/sdk';
import { factorialRequest } from '../lib/index.js';

export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list-teams', {
    description: 'List all teams in the company.',
    parameters: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return factorialRequest(ctx, '/teams/teams');
    },
  });
}
