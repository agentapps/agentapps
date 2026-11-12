import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseSiteUrl, sitePath } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { DELETE } from './annotations.js';

export function registerDeleteSiteTool(app: AgentApp): void {
  app.tool('delete-site', {
    description:
      "Remove a property from the connected account's Search Console. The account loses " +
      'access to its data and settings through this app until the property is added and ' +
      'verified again; other users of the property keep theirs, and the website is not ' +
      'touched. Use list-sites first to copy the exact siteUrl. Returns { success, siteUrl }.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
      },
      required: ['siteUrl'],
    },
    // Destructive: access may need a new ownership verification to come back.
    annotations: DELETE,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      await apiRequest('DELETE', sitePath(siteUrl), ctx);
      return { success: true, siteUrl };
    },
  });
}
