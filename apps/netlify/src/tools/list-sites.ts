/**
 * list-sites — list the Netlify sites the user's token can access.
 *
 * Returns DATA (ids, names, urls) — the renderer composes the list UI.
 */

import type { AgentApp } from '@agentapps/sdk';
import { netlifyClient } from '../lib/netlify-client.js';

export function registerListSitesTool(app: AgentApp): void {
  app.tool('list-sites', {
    description:
      'List the Netlify sites reachable with the configured token. Returns { sites: [{ id, name, url, ssl_url }] }.',
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
      const client = await netlifyClient(ctx);
      const sites = await client.listSites();

      return {
        sites: sites.map((s) => ({
          id: s.id,
          name: s.name,
          url: s.url ?? null,
          ssl_url: s.ssl_url ?? null,
        })),
      };
    },
  });
}
