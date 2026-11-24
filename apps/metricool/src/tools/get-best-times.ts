import type { AgentApp } from '@agentapps/sdk';
import { type Args, readBrandId, readLocalDateTime, readOneOf, readTimezone } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';
import type { Envelope } from '../lib/posts.js';

/** The networks Metricool computes best times for. */
export const BEST_TIME_NETWORKS = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
] as const;

interface BestTimesDay {
  dayOfWeek?: number;
  bestTimesByHour?: Array<{ hourOfDay?: number; value?: number }>;
}

export function registerGetBestTimesTool(app: AgentApp): void {
  /** @spec METRICOOL-REQ-8 */
  app.tool('get-best-times', {
    description:
      'Get the best times to publish on one network of a brand, from its audience activity in a date range. Returns { network, days: [{ dayOfWeek, hours: [{ hour, value }] }] }: a higher value is a better hour. Use it to pick the date of schedule-post.',
    parameters: {
      type: 'object',
      properties: {
        brandId: { type: ['number', 'string'], description: 'Brand id, from list-brands.' },
        network: { type: 'string', enum: [...BEST_TIME_NETWORKS], description: 'The network.' },
        start: {
          type: 'string',
          description: 'Start of the range, local date-time, e.g. 2026-12-01T00:00:00.',
        },
        end: {
          type: 'string',
          description: 'End of the range, local date-time, e.g. 2026-12-07T23:59:59.',
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone of the dates, e.g. Europe/Madrid. list-brands gives the brand's.",
        },
      },
      required: ['brandId', 'network', 'start', 'end', 'timezone'],
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
      const network = readOneOf(a.network, 'network', BEST_TIME_NETWORKS);
      const start = readLocalDateTime(a.start, 'start');
      const end = readLocalDateTime(a.end, 'end');
      const timezone = readTimezone(a.timezone);
      const answer = await apiRequest<Envelope<BestTimesDay[]>>(
        'GET',
        `/v2/scheduler/besttimes/${network}`,
        ctx,
        { params: { blogId, start, end, timezone } },
      );
      const days = (Array.isArray(answer?.data) ? answer.data : []).map((day) => ({
        dayOfWeek: day.dayOfWeek ?? null,
        hours: (Array.isArray(day.bestTimesByHour) ? day.bestTimesByHour : []).map((hour) => ({
          hour: hour.hourOfDay ?? null,
          value: hour.value ?? null,
        })),
      }));
      return { network, days };
    },
  });
}
