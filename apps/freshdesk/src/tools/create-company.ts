import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * create-company — POST /companies
 *
 * Creates a new company in Freshdesk.
 */
export function registerCreateCompanyTool(app: AgentApp): void {
  app.tool('create-company', {
    description:
      'Create a new Freshdesk company (POST /api/v2/companies). Requires name. Optionally provide domains (array of domain strings), description, and note. Returns the created company.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the company.',
        },
        domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of domain names associated with the company (e.g. ["example.com"]).',
        },
        description: {
          type: 'string',
          description: 'Description of the company.',
        },
        note: {
          type: 'string',
          description: 'Internal note about the company.',
        },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        name: args.name,
      };
      if (args.domains !== undefined) params.domains = args.domains;
      if (args.description !== undefined) params.description = args.description;
      if (args.note !== undefined) params.note = args.note;

      return await freshdeskRequest('POST', '/companies', params, ctx);
    },
  });
}
