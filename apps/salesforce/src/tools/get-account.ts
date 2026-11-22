import type { AgentApp } from '@agentapps/sdk';
import { salesforceRequest } from '../lib/index.js';

/**
 * get-account — Retrieve a single Salesforce account by ID.
 * GET /services/data/v59.0/sobjects/Account/{accountId}
 */
export function registerGetAccountTool(app: AgentApp): void {
  app.tool('get-account', {
    description:
      'Retrieve a Salesforce account by ID. Returns the full account record. Params: accountId (required).',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'Salesforce Account ID (18-char).',
        },
      },
      required: ['accountId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { accountId } = args as { accountId: string };

      const data = (await salesforceRequest(
        'GET',
        `sobjects/Account/${encodeURIComponent(accountId)}`,
        undefined,
        ctx,
      )) as any;

      return {
        id: data.Id,
        name: data.Name ?? null,
        industry: data.Industry ?? null,
        phone: data.Phone ?? null,
        website: data.Website ?? null,
        type: data.Type ?? null,
        billingCity: data.BillingCity ?? null,
        billingState: data.BillingState ?? null,
        billingCountry: data.BillingCountry ?? null,
        numberOfEmployees: data.NumberOfEmployees ?? null,
        annualRevenue: data.AnnualRevenue ?? null,
        description: data.Description ?? null,
        ownerId: data.OwnerId ?? null,
        createdDate: data.CreatedDate ?? null,
        lastModifiedDate: data.LastModifiedDate ?? null,
      };
    },
  });
}
