import type { AgentApp } from '@agentapps/sdk';
import { type Args, optionalString, parseInteger } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { READ } from './annotations.js';

interface SitesResponse {
  siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
}

export function registerListSitesTool(app: AgentApp): void {
  app.tool('list-sites', {
    description:
      'List the Search Console properties the connected Google account can see. Returns ' +
      '{ sites: [{ siteUrl, permissionLevel }], total, hasMore, nextOffset }. siteUrl is either ' +
      '"sc-domain:example.com" (Domain property) or "https://www.example.com/" (URL-prefix ' +
      'property); pass it unchanged as siteUrl to every other tool. permissionLevel is ' +
      'siteOwner, siteFullUser, siteRestrictedUser or siteUnverifiedUser (no data access). ' +
      'Start here when you do not know the exact siteUrl.',
    parameters: {
      type: 'object',
      properties: {
        contains: {
          type: 'string',
          description: 'Only properties whose siteUrl contains this text (case-insensitive).',
        },
        offset: { type: 'integer', minimum: 0, description: 'Skip this many (default 0).' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum properties to return (default 100, max 500).',
        },
      },
    },
    annotations: READ,
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const contains = optionalString('contains', a.contains)?.toLowerCase();
      const offset = parseInteger('offset', a.offset, 0, Number.MAX_SAFE_INTEGER, 0);
      const limit = parseInteger('limit', a.limit, 1, 500, 100);

      const data = await apiRequest<SitesResponse>('GET', '/webmasters/v3/sites', ctx);
      const all = (data?.siteEntry ?? [])
        .filter((s) => !contains || s.siteUrl.toLowerCase().includes(contains))
        .map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel }))
        .sort((x, y) => x.siteUrl.localeCompare(y.siteUrl));
      const sites = all.slice(offset, offset + limit);
      const hasMore = offset + sites.length < all.length;
      return {
        sites,
        total: all.length,
        hasMore,
        ...(hasMore ? { nextOffset: offset + sites.length } : {}),
      };
    },
  });
}
