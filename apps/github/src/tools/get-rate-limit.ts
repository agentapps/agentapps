import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerGetRateLimitTool(app: AgentApp) {
  app.tool('get-rate-limit', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'Read the current GitHub API rate-limit budget.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      return await githubRequest(ctx, '/rate_limit');
    },
  });
}
