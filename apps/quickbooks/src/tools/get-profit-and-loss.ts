/**
 * get-profit-and-loss — retrieve the Profit and Loss report from QuickBooks Online.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetProfitAndLossTool(app: AgentApp): void {
  app.tool('get-profit-and-loss', {
    description:
      'Get the Profit and Loss (income statement) report for a date range from QuickBooks Online.',
    parameters: {
      type: 'object',
      properties: {
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format.',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format.',
        },
      },
      required: ['startDate', 'endDate'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const startDate = args.startDate as string;
      const endDate = args.endDate as string;
      return await quickbooksRequest(
        'GET',
        `reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`,
        null,
        ctx,
      );
    },
  });
}
