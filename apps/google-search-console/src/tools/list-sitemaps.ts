import type { AgentApp } from '@agentapps/sdk';
import { fitToBudget } from '../lib/analytics.js';
import {
  type Args,
  MAX_RESULT_CHARS,
  parseHttpUrl,
  parseInteger,
  parseSiteUrl,
  sitePath,
} from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { type ApiSitemap, curateSitemap } from '../lib/sitemaps.js';
import { READ } from './annotations.js';

export function registerListSitemapsTool(app: AgentApp): void {
  app.tool('list-sitemaps', {
    description:
      'List the sitemaps submitted for a property (or the children of one sitemap index). ' +
      'Returns { sitemaps: [{ path, type, isSitemapsIndex, isPending, lastSubmitted, ' +
      'lastDownloaded, errors, warnings, contents: [{ type, submitted }] }], total, hasMore, ' +
      'nextOffset }. errors > 0 means Google could not process the sitemap; use get-sitemap ' +
      'for one sitemap and submit-sitemap to (re)submit.',
    parameters: {
      type: 'object',
      properties: {
        siteUrl: {
          type: 'string',
          description: 'Property exactly as list-sites returns it (sc-domain:... or https://.../).',
        },
        sitemapIndex: {
          type: 'string',
          description: 'Absolute URL of a sitemap index: list the sitemaps inside it instead.',
        },
        offset: { type: 'integer', minimum: 0, description: 'Skip this many (default 0).' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum sitemaps to return (default 50, max 200).',
        },
      },
      required: ['siteUrl'],
    },
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const siteUrl = parseSiteUrl(a.siteUrl);
      const sitemapIndex =
        a.sitemapIndex === undefined || a.sitemapIndex === ''
          ? undefined
          : parseHttpUrl('sitemapIndex', a.sitemapIndex);
      const offset = parseInteger('offset', a.offset, 0, Number.MAX_SAFE_INTEGER, 0);
      const limit = parseInteger('limit', a.limit, 1, 200, 50);

      const data = await apiRequest<{ sitemap?: ApiSitemap[] }>(
        'GET',
        `${sitePath(siteUrl)}/sitemaps`,
        ctx,
        { params: { sitemapIndex } },
      );
      const all = data?.sitemap ?? [];
      const page = all.slice(offset, offset + limit).map(curateSitemap);
      const { kept, limitApplied } = fitToBudget(page, MAX_RESULT_CHARS - 1_000);
      const hasMore = offset + kept.length < all.length;
      return {
        siteUrl,
        sitemaps: kept,
        total: all.length,
        hasMore,
        ...(hasMore ? { nextOffset: offset + kept.length } : {}),
        ...(limitApplied ? { limitApplied: true } : {}),
      };
    },
  });
}
