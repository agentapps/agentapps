/**
 * get_balance_sheet — retrieve the Balance Sheet report from QuickBooks Online.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerGetBalanceSheetTool(app: AgentApp): void {
  app.tool('get_balance_sheet', {
    description: 'Get the Balance Sheet report for a date range from QuickBooks Online.',
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
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const startDate = args.startDate as string;
      const endDate = args.endDate as string;
      return await quickbooksRequest(
        'GET',
        `reports/BalanceSheet?start_date=${startDate}&end_date=${endDate}`,
        null,
        ctx,
      );
    },
  });
}
