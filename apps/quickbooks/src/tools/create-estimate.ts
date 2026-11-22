/**
 * create_estimate — create a new QuickBooks Online estimate.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerCreateEstimateTool(app: AgentApp): void {
  app.tool('create_estimate', {
    description:
      'Create a new estimate in QuickBooks Online. Requires a customer reference and at least one line item.',
    parameters: {
      type: 'object',
      properties: {
        customerRefId: {
          type: 'string',
          description: 'The QuickBooks customer ID to send the estimate to.',
        },
        lines: {
          type: 'array',
          description: 'Line items for the estimate.',
          items: {
            type: 'object',
            properties: {
              amount: {
                type: 'number',
                description: 'Amount for this line item.',
              },
              description: {
                type: 'string',
                description: 'Description of the line item.',
              },
              detailType: {
                type: 'string',
                description: 'Line detail type (e.g. SalesItemLineDetail).',
              },
              itemRefId: {
                type: 'string',
                description: 'The QuickBooks item ID for this line.',
              },
            },
            required: ['amount', 'detailType'],
          },
        },
        expirationDate: {
          type: 'string',
          description: 'Expiration date of the estimate in YYYY-MM-DD format.',
        },
      },
      required: ['customerRefId', 'lines'],
    },
    // Records the estimate in the books; it is not emailed to the customer.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const customerRefId = args.customerRefId as string;
      const lines = args.lines as Array<Record<string, unknown>>;

      const body: Record<string, unknown> = {
        CustomerRef: { value: customerRefId },
        Line: lines.map((line) => {
          const lineItem: Record<string, unknown> = {
            Amount: line.amount,
            DetailType: line.detailType || 'SalesItemLineDetail',
          };
          if (line.description) lineItem.Description = line.description;
          if (line.detailType === 'SalesItemLineDetail' || !line.detailType) {
            lineItem.SalesItemLineDetail = {
              ...(line.itemRefId ? { ItemRef: { value: line.itemRefId } } : {}),
            };
          }
          return lineItem;
        }),
      };

      if (args.expirationDate) body.ExpirationDate = args.expirationDate;

      return await quickbooksRequest('POST', 'estimate', body, ctx);
    },
  });
}
