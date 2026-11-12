import type { AgentApp } from '@agentapps/sdk';
import { type Args, parseHttpUrl, parseSiteUrl } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import {
  type ApiSitemap,
  curateSitemap,
  SITEMAP_URL_SCHEMA,
  sitemapPath,
} from '../lib/sitemaps.js';
import { READ } from './annotations.js';

export function registerGetSitemapTool(app: AgentApp): void {
  app.tool('get-sitemap', {
    description:
      'Get the processing status of one submitted sitemap. Returns { path, type, ' +
      'isSitemapsIndex, isPending, lastSubmitted, lastDownloaded, errors, warnings, contents: ' +
      '[{ type, submitted }] }. isPending true means Google has not processed it yet. ' +
      '[NOT_FOUND] means it was never submitted for this property: use submit-sitemap.',
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
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const sitemapUrl = parseHttpUrl('sitemapUrl', a.sitemapUrl);
      const data = await apiRequest<ApiSitemap>('GET', sitemapPath(siteUrl, sitemapUrl), ctx);
      return { siteUrl, ...curateSitemap(data ?? {}) };
    },
  });
}
