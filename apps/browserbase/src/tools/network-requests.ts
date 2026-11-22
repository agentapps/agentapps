import type { AgentApp } from '@agentapps/sdk';
import { getNetworkRequests, requireSession } from '../lib/index.js';

export function registerNetworkRequestsTool(app: AgentApp): void {
  app.tool('network-requests', {
    // Reads the request log the app keeps in memory: it changes nothing and leaves the process
    // for nothing.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    description: 'List network requests made in the current session.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
        includeStatic: {
          type: 'boolean',
          description: 'Include static resources (images, fonts, scripts). Default: false',
        },
      },
      required: ['sessionId'],
    },
    handler: async (args, _ctx) => {
      requireSession(args.sessionId as string); // validate session exists
      const requests = getNetworkRequests(args.sessionId as string);
      const staticTypes = ['image', 'font', 'stylesheet', 'script', 'media'];

      const filtered = args.includeStatic
        ? requests
        : requests.filter((r) => !staticTypes.includes(r.resourceType));

      if (filtered.length === 0) return 'No network requests recorded.';

      return filtered.map((r) => `${r.method} ${r.url} → ${r.status ?? 'pending'}`).join('\n');
    },
  });
}
