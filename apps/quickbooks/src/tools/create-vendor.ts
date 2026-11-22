/**
 * create-vendor — create a new QuickBooks Online vendor.
 */

import type { AgentApp } from '@agentapps/sdk';
import { quickbooksRequest } from '../lib/quickbooks-client.js';

export function registerCreateVendorTool(app: AgentApp): void {
  app.tool('create-vendor', {
    description: 'Create a new vendor in QuickBooks Online. Returns the created vendor object.',
    parameters: {
      type: 'object',
      properties: {
        displayName: {
          type: 'string',
          description: "The vendor's display name (required, must be unique).",
        },
        givenName: {
          type: 'string',
          description: "The vendor's first name.",
        },
        familyName: {
          type: 'string',
          description: "The vendor's last name.",
        },
        email: {
          type: 'string',
          description: "The vendor's primary email address.",
        },
        phone: {
          type: 'string',
          description: "The vendor's primary phone number.",
        },
        companyName: {
          type: 'string',
          description: "The vendor's company name.",
        },
      },
      required: ['displayName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        DisplayName: args.displayName as string,
      };
      if (args.givenName) body.GivenName = args.givenName;
      if (args.familyName) body.FamilyName = args.familyName;
      if (args.email) body.PrimaryEmailAddr = { Address: args.email };
      if (args.phone) body.PrimaryPhone = { FreeFormNumber: args.phone };
      if (args.companyName) body.CompanyName = args.companyName;

      return await quickbooksRequest('POST', 'vendor', body, ctx);
    },
  });
}
