import type { AgentApp } from '@agentapps/sdk';
import { formatCompany, hubspotRequest } from '../lib/index.js';

/**
 * list-companies — GET /crm/v3/objects/companies.
 */
export function registerListCompaniesTool(app: AgentApp): void {
  app.tool('list-companies', {
    description:
      'List HubSpot companies with optional filters. Returns curated rows { id, name, domain, industry, type, phone, city, state, country, numberOfEmployees, lifecycleStage, createdAt }. Params: limit (1-100, def 50), after, properties?',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page. Min 1, max 100, default 50.' },
        after: {
          type: 'string',
          description: 'Pagination cursor from previous response.paging.next.after.',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional company properties to include.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        limit = 50,
        after,
        properties,
      } = (args ?? {}) as {
        limit?: number;
        after?: string;
        properties?: string[];
      };

      const defaultProps = [
        'name',
        'domain',
        'industry',
        'type',
        'phone',
        'website',
        'city',
        'state',
        'country',
        'numberofemployees',
        'annualrevenue',
        'lifecyclestage',
        'createdate',
        'hs_lastmodifieddate',
      ];
      const allProps = properties ? [...new Set([...defaultProps, ...properties])] : defaultProps;

      const params: Record<string, any> = {
        limit: Math.min(Math.max(limit, 1), 100),
        properties: allProps.join(','),
      };
      if (after) params.after = after;

      const data = (await hubspotRequest(ctx, '/crm/v3/objects/companies', { params })) as any;

      return {
        companies: (data.results ?? []).map(formatCompany),
        total: data.results?.length ?? 0,
        hasMore: !!data.paging?.next?.after,
        nextCursor: data.paging?.next?.after ?? null,
      };
    },
  });
}
