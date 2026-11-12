import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * list-routing-forms — GET /routing_forms
 *
 * Lists routing forms for the organization.
 */
export function registerListRoutingFormsTool(app: AgentApp): void {
  app.tool('list-routing-forms', {
    description:
      'List Calendly routing forms for the organization (GET /routing_forms). Requires organizationUri. Returns routing forms with name, status, questions, etc.',
    parameters: {
      type: 'object',
      properties: {
        organizationUri: {
          type: 'string',
          description:
            'The Calendly organization URI (e.g. "https://api.calendly.com/organizations/AAAA"). Get this from get-current-user → current_organization.',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default 20, max 100).',
        },
      },
      required: ['organizationUri'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const params: Record<string, string | number | boolean | undefined> = {
        organization: String(a.organizationUri),
      };
      if (a.count !== undefined) params.count = Number(a.count);

      const data = (await calendlyRequest('GET', '/routing_forms', params, ctx)) as {
        collection: unknown[];
        pagination: unknown;
      };
      return {
        count: data.collection.length,
        routingForms: data.collection,
        pagination: data.pagination,
      };
    },
  });
}
