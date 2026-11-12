import type { AgentApp } from '@agentapps/sdk';
import { videoId } from '../lib/args.js';
import { breakdownReport, REPORT_PARAMETERS } from '../lib/report.js';

export function registerGetVideoReportTool(app: AgentApp): void {
  app.tool('get-video-report', {
    description:
      'Analytics for one video over a date range: views, watch time, average view duration and ' +
      'percentage, subscribers gained and lost, likes, comments and shares, as totals or broken ' +
      'down by day, month, country, traffic source, device type or operating system. Returns ' +
      '{ totals } for groupBy none, otherwise { columns, rows }. Use get-top-videos or list-videos ' +
      'to find video ids; get-audience-retention for where viewers drop off.',
    parameters: {
      type: 'object',
      properties: {
        videoId: {
          type: 'string',
          description:
            '11-character video id of a video on the connected channel (e.g. dQw4w9WgXcQ).',
        },
        ...REPORT_PARAMETERS,
        channelId: {
          type: 'string',
          description:
            'Channel id (UC...) that owns the video. Default: the connected account’s channel.',
        },
      },
      required: ['videoId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      return breakdownReport(ctx, a, videoId(a));
    },
  });
}
