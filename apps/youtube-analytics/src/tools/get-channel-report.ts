import type { AgentApp } from '@agentapps/sdk';
import { breakdownReport, REPORT_PARAMETERS } from '../lib/report.js';

export function registerGetChannelReportTool(app: AgentApp): void {
  app.tool('get-channel-report', {
    description:
      'Channel analytics for a date range: views, watch time (estimatedMinutesWatched), average ' +
      'view duration, subscribers gained and lost, likes, comments and shares, as totals or broken ' +
      'down by day, month, country, content type, traffic source, device type or operating system. ' +
      'Returns { totals } for groupBy none, otherwise { columns, rows } (rows are arrays in column ' +
      'order). Dates are Pacific time; the last 2-3 days are usually incomplete. For one video use ' +
      'get-video-report; for any other metric or dimension combination use run-report.',
    parameters: {
      type: 'object',
      properties: {
        ...REPORT_PARAMETERS,
        channelId: {
          type: 'string',
          description:
            'Channel id (UC...). Default: the connected account’s channel. Only channels the account owns or manages work.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => breakdownReport(ctx, (args ?? {}) as Record<string, unknown>),
  });
}
