import type { AgentApp } from '@agentapps/sdk';
import { formatTicket, hubspotRequest } from '../lib/index.js';

/**
 * list-tickets — GET /crm/v3/objects/tickets.
 */
export function registerListTicketsTool(app: AgentApp): void {
  app.tool('list-tickets', {
    description:
      'List HubSpot tickets with optional filters. Returns curated rows { id, subject, content, status, priority, category, pipeline, createdAt }. Params: limit (1-100, def 50), after, properties?',
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
          description: 'Additional ticket properties to include.',
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
        'subject',
        'content',
        'hs_ticket_priority',
        'hs_pipeline_stage',
        'hs_ticket_category',
        'hs_pipeline',
        'source_type',
        'createdate',
        'hs_lastmodifieddate',
      ];
      const allProps = properties ? [...new Set([...defaultProps, ...properties])] : defaultProps;

      const params: Record<string, any> = {
        limit: Math.min(Math.max(limit, 1), 100),
        properties: allProps.join(','),
      };
      if (after) params.after = after;

      const data = (await hubspotRequest(ctx, '/crm/v3/objects/tickets', { params })) as any;

      return {
        tickets: (data.results ?? []).map(formatTicket),
        total: data.results?.length ?? 0,
        hasMore: !!data.paging?.next?.after,
        nextCursor: data.paging?.next?.after ?? null,
      };
    },
  });
}
