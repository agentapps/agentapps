import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseHttpUrl, parseSiteUrl } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { SITEMAP_URL_SCHEMA, sitemapPath } from '../lib/sitemaps.js';
import { IDEMPOTENT_WRITE } from './annotations.js';

export function registerSubmitSitemapTool(app: AgentApp): void {
  app.tool('submit-sitemap', {
    description:
      'Submit (or resubmit) a sitemap for a property so Google crawls it. Needs owner or full ' +
      'user permission on the property. Google processes it later: check with get-sitemap ' +
      '(isPending, errors). Resubmitting the same URL is harmless. Returns { success, siteUrl, ' +
      'sitemapUrl }.',
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
    // A PUT that registers the sitemap: repeatable, and undone with delete-sitemap.
    annotations: IDEMPOTENT_WRITE,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const sitemapUrl = parseHttpUrl('sitemapUrl', a.sitemapUrl);
      await apiRequest('PUT', sitemapPath(siteUrl, sitemapUrl), ctx);
      return {
        success: true,
        siteUrl,
        sitemapUrl,
        message: 'Submitted. Google fetches it asynchronously; check get-sitemap later.',
      };
    },
  });
}
