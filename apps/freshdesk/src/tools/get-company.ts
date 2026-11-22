import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * get-company — GET /companies/{companyId}
 *
 * Retrieves a single Freshdesk company by its ID.
 */
export function registerGetCompanyTool(app: AgentApp): void {
  app.tool('get-company', {
    description:
      'Get detailed information about a specific Freshdesk company by its ID (GET /api/v2/companies/{companyId}). Returns name, domains, description, note, and other company fields.',
    parameters: {
      type: 'object',
      properties: {
        companyId: {
          type: 'number',
          description: 'The Freshdesk company ID.',
        },
      },
      required: ['companyId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const companyId = args.companyId as number;
      return await freshdeskRequest('GET', `/companies/${companyId}`, undefined, ctx);
    },
  });
}
