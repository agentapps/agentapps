import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerDispatchEventTool(app: AgentApp) {
  app.tool('dispatch-event', {
    annotations: { sensitive: true, readOnlyHint: false },
    description: 'Send a `repository_dispatch` event to trigger workflows.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        event_type: { type: 'string', description: 'Custom event type' },
        client_payload: { type: 'object', description: 'Optional payload' },
      },
      required: ['owner', 'repo', 'event_type'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, event_type, client_payload } = args as {
        owner: string;
        repo: string;
        event_type: string;
        client_payload?: Record<string, unknown>;
      };
      if (!event_type || event_type.trim() === '')
        throw new Error('`event_type` must be a non-empty string.');
      return await githubRequest(ctx, `/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        body: { event_type, client_payload },
      });
    },
  });
}
