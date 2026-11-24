import type { AgentApp } from '@agentapps/sdk';
import { type Args, readBrandId, readLocalDateTime, readOneOf, readTimezone } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import { capItems } from '../lib/limit.js';
import type { Envelope } from '../lib/posts.js';

/** GET /v2/analytics/{type}/{network}: the networks each type exists for. */
export const PUBLISHED_NETWORKS = {
  posts: [
    'bluesky',
    'facebook',
    'instagram',
    'linkedin',
    'pinterest',
    'threads',
    'tiktok',
    'twitter',
  ],
  reels: ['facebook', 'instagram'],
  stories: ['facebook', 'instagram'],
} as const;

const TYPES = ['posts', 'reels', 'stories'] as const;

export function registerListPublishedPostsTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-10 */
  app.tool('list-published-posts', {
    description:
      'List what one network of a brand published between two dates, each item with the metrics Metricool has for it (impressions, likes, comments, engagement and others; the fields depend on the network). Returns { network, type, items: [...] }. type is posts (default; bluesky, facebook, instagram, linkedin, pinterest, threads, tiktok, twitter), reels or stories (facebook and instagram only). A large answer is cut with limitApplied: true, then narrow the range.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        network: { type: 'string', description: 'The network, e.g. instagram. "twitter" is X.' },
        type: {
          type: 'string',
          enum: [...TYPES],
          description: 'posts (default), reels or stories.',
        },
        from: {
          type: 'string',
          description: 'Start of the range, local date-time, e.g. 2026-11-01T00:00:00.',
        },
        to: {
          type: 'string',
          description: 'End of the range, local date-time, e.g. 2026-11-30T23:59:59.',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone of the dates, e.g. Europe/Madrid. Optional.',
        },
      },
      required: ['brandId', 'network', 'from', 'to'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const blogId = readBrandId(a.brandId);
      const type =
        a.type === undefined || a.type === null ? 'posts' : readOneOf(a.type, 'type', TYPES);
      let network: string;
      try {
        network = readOneOf(a.network, 'network', PUBLISHED_NETWORKS[type]);
      } catch (err) {
        throw new Error(`${(err as Error).message} These are the networks that have ${type}.`);
      }
      const from = readLocalDateTime(a.from, 'from');
      const to = readLocalDateTime(a.to, 'to');
      const timezone =
        a.timezone === undefined || a.timezone === null ? undefined : readTimezone(a.timezone);
      const answer = await apiRequest<Envelope<unknown[]>>(
        'GET',
        `/v2/analytics/${type}/${network}`,
        ctx,
        { params: { blogId, from, to, timezone } },
      );
      const all = Array.isArray(answer?.data) ? answer.data : [];
      return { network, type, ...capItems(all, type) };
    },
  });
}
