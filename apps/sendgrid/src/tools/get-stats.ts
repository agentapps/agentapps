/**
 * get-stats — GET /stats?start_date={startDate}
 *
 * Retrieve global email statistics from SendGrid.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerGetStatsTool(app: AgentApp): void {
  app.tool('get-stats', {
    description:
      'Get global email statistics from SendGrid (GET /stats). Returns daily stats including requests, delivered, opens, clicks, bounces, etc. Requires a start_date in YYYY-MM-DD format.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date for statistics in YYYY-MM-DD format.',
        },
        endDate: {
          type: 'string',
          description: 'Optional end date in YYYY-MM-DD format. Defaults to today.',
        },
      },
      required: ['startDate'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const startDate = args.startDate as string;
      const endDate = args.endDate as string | undefined;

      if (!startDate) {
        throw new Error('startDate is required (YYYY-MM-DD format).');
      }

      let path = `/stats?start_date=${encodeURIComponent(startDate)}`;
      if (endDate) {
        path += `&end_date=${encodeURIComponent(endDate)}`;
      }

      const res = await sendgridRequest('GET', path, null, ctx);

      return { stats: res };
    },
  });
}
