import type { AgentApp } from '@agentapps/sdk';
import { networkRequests } from '../browser.js';

export function registerNetworkRequestsTool(app: AgentApp): void {
  app.tool('network-requests', {
    description: 'Returns all network requests since loading the page',
    parameters: {
      type: 'object',
      properties: {
        includeStatic: {
          type: 'boolean',
          default: false,
          description:
            'Whether to include successful static resources like images, fonts, scripts, etc. Defaults to false.',
        },
      },
    },
    // Only filters the request log this process already holds in memory.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (args) => {
      const includeStatic = args.includeStatic as boolean;
      const staticTypes = ['image', 'font', 'stylesheet', 'script', 'media'];

      const filtered = includeStatic
        ? networkRequests
        : networkRequests.filter((r) => !staticTypes.includes(r.resourceType));

      if (filtered.length === 0) {
        return 'No network requests';
      }

      return filtered.map((r) => `${r.method} ${r.url} -> ${r.status || 'pending'}`).join('\n');
    },
  });
}
