/**
 * update_customer — update an existing QuickBooks Online customer.
 *
 * QuickBooks uses POST (not PUT) for updates. The request body must include
 * the customer's Id and SyncToken (for optimistic concurrency).
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerUpdateCustomerTool(app: AgentApp): void {
  app.tool('update_customer', {
    description:
      'Update an existing customer in QuickBooks Online. Requires the customer Id and SyncToken (from a previous get_customer call).',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The QuickBooks customer ID.',
        },
        syncToken: {
          type: 'string',
          description: 'The SyncToken from the current customer record (optimistic locking).',
        },
        displayName: {
          type: 'string',
          description: "The customer's display name.",
        },
        givenName: {
          type: 'string',
          description: "The customer's first name.",
        },
        familyName: {
          type: 'string',
          description: "The customer's last name.",
        },
        email: {
          type: 'string',
          description: "The customer's primary email address.",
        },
        phone: {
          type: 'string',
          description: "The customer's primary phone number.",
        },
        companyName: {
          type: 'string',
          description: "The customer's company name.",
        },
      },
      required: ['id', 'syncToken'],
    },
    // Setting the fields again undoes it. A repeat with the same syncToken is rejected as stale.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        Id: args.id as string,
        SyncToken: args.syncToken as string,
      };
      if (args.displayName) body.DisplayName = args.displayName;
      if (args.givenName) body.GivenName = args.givenName;
      if (args.familyName) body.FamilyName = args.familyName;
      if (args.email) body.PrimaryEmailAddr = { Address: args.email };
      if (args.phone) body.PrimaryPhone = { FreeFormNumber: args.phone };
      if (args.companyName) body.CompanyName = args.companyName;

      return await quickbooksRequest('POST', 'customer', body, ctx);
    },
  });
}
