import type { AgentApp } from '@agentapps/sdk';
import {
  type Args,
  readBrandId,
  readLocalDateTime,
  readText,
  readTimezone,
  withOffset,
} from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import type { Envelope } from '../lib/posts.js';

interface Timeline {
  metric?: string;
  values?: Array<{ dateTime?: string; value?: number }>;
}

/** A network, metric or subject name: Metricool's own identifiers, never free text in a URL. */
function readName(value: unknown, name: string): string {
  const text = readText(value, name).trim();
  if (!/^[A-Za-z0-9_.+ -]{1,80}$/.test(text)) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as a Metricool name such as "instagram" or "followers"; got ${JSON.stringify(value)}.`,
    );
  }
  return text;
}

export function registerGetMetricTimelineTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-9 */
  app.tool('get-metric-timeline', {
    description:
      'Get the time series of one metric of one network of a brand. Returns { series: [{ metric, values: [{ date, value }] }] }. network is one of tiktok, tiktokads, pinterest, youtube, facebook, gmb, instagram, linkedin, twitter, twitch, threads, bluesky. subject picks what the metric is about and is mandatory for Instagram: account, posts, reels or stories. Examples: instagram + account + followers; instagram + posts + interactions, engagement, reach, impressions, likes, comments, saves or shares; instagram + reels + videoviews; facebook + posts + impressions or clicks; facebook + account + pageFollows or pageImpressions; linkedin + account + followers; linkedin + posts + impressions; tiktok + account + followers_count; threads + posts + views; bluesky + account + followers_count. Metric names are case-insensitive.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        network: { type: 'string', description: 'The network, e.g. instagram.' },
        metric: { type: 'string', description: 'The metric, e.g. followers.' },
        subject: {
          type: 'string',
          description:
            'What the metric is about: account, posts, reels, stories. Mandatory for Instagram.',
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
          description:
            "IANA timezone of the dates, e.g. Europe/Madrid. list-brands gives the brand's.",
        },
      },
      required: ['brandId', 'network', 'metric', 'from', 'to', 'timezone'],
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
      const network = readName(a.network, 'network').toLowerCase();
      const metric = readName(a.metric, 'metric');
      const subject =
        a.subject === undefined || a.subject === null ? undefined : readName(a.subject, 'subject');
      const timezone = readTimezone(a.timezone);
      const from = withOffset(readLocalDateTime(a.from, 'from'), timezone);
      const to = withOffset(readLocalDateTime(a.to, 'to'), timezone);
      const answer = await apiRequest<Envelope<Timeline[]>>('GET', '/v2/analytics/timelines', ctx, {
        params: { blogId, network, metric, subject, from, to, timezone },
      });
      const series = (Array.isArray(answer?.data) ? answer.data : []).map((line) => ({
        metric: line.metric ?? metric,
        values: (Array.isArray(line.values) ? line.values : []).map((point) => ({
          date: point.dateTime ?? null,
          value: point.value ?? null,
        })),
      }));
      return { series };
    },
  });
}
