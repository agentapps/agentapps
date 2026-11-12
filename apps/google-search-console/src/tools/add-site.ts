import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseSiteUrl, sitePath } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { IDEMPOTENT_WRITE } from './annotations.js';

export function registerAddSiteTool(app: AgentApp): void {
  app.tool('add-site', {
    description:
      "Add a property to the connected account's Search Console. A new property starts " +
      'unverified (permissionLevel siteUnverifiedUser, no data) until ownership is verified ' +
      'outside this app (DNS record, HTML file or tag, in the Search Console UI); if this ' +
      'account already verified it, access comes back at once. Adding an existing property is ' +
      'harmless. Returns { success, siteUrl, permissionLevel }.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description:
            'The property: "sc-domain:example.com" (Domain property, needs DNS verification) ' +
            'or a URL prefix such as "https://www.example.com/".',
        },
      },
      required: ['siteUrl'],
    },
    // A PUT: repeatable, and undone with delete-site.
    annotations: IDEMPOTENT_WRITE,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      await apiRequest('PUT', sitePath(siteUrl), ctx);
      // The add returns no body; read the entry back so the agent sees whether it is verified.
      const site = await apiRequest<{ siteUrl?: string; permissionLevel?: string }>(
        'GET',
        sitePath(siteUrl),
        ctx,
      ).catch(() => undefined);
      return {
        success: true,
        siteUrl,
        permissionLevel: site?.permissionLevel ?? null,
      };
    },
  });
}
