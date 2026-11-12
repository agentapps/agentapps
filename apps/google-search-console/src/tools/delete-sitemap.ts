import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseHttpUrl, parseSiteUrl } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { SITEMAP_URL_SCHEMA, sitemapPath } from '../lib/sitemaps.js';
import { DELETE } from './annotations.js';

export function registerDeleteSitemapTool(app: AgentApp): void {
  app.tool('delete-sitemap', {
    description:
      "Remove a sitemap from a property's Sitemaps report. Its report history in Search " +
      'Console is lost; the sitemap file on the website is not touched, and Google may still ' +
      'find it through robots.txt. Needs owner or full user permission. Returns { success, ' +
      'siteUrl, sitemapUrl }.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        sitemapUrl: SITEMAP_URL_SCHEMA,
      },
      required: ['siteUrl', 'sitemapUrl'],
    },
    // Destructive: resubmitting does not bring back the removed report history.
    annotations: DELETE,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const sitemapUrl = parseHttpUrl('sitemapUrl', a.sitemapUrl);
      await apiRequest('DELETE', sitemapPath(siteUrl, sitemapUrl), ctx);
      return { success: true, siteUrl, sitemapUrl };
    },
  });
}
