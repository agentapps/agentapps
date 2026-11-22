import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * list-companies — GET /companies
 *
 * Lists companies in the Freshdesk helpdesk.
 */
export function registerListCompaniesTool(app: AgentApp): void {
  app.tool('list-companies', {
    description:
      'List Freshdesk companies (GET /api/v2/companies). Optional pagination: page, per_page. Returns company id, name, domains, description, and other fields.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number for pagination (default 1).',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (default 30, max 100).',
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
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, unknown> = {};
      if (a.page !== undefined) params.page = a.page;
      if (a.per_page !== undefined) params.per_page = a.per_page;

      const hasParams = Object.keys(params).length > 0;
      const companies = await freshdeskRequest<unknown[]>(
        'GET',
        '/companies',
        hasParams ? params : undefined,
        ctx,
      );

      return { count: companies.length, companies };
    },
  });
}
