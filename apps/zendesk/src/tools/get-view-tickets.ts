import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * get-view-tickets — GET /views/{id}/tickets.json.
 */
export function registerGetViewTicketsTool(app: AgentApp): void {
  app.tool('get-view-tickets', {
    description:
      'Get tickets from a specific Zendesk view. Returns curated ticket rows. Params: viewId, limit (1-100, def 30), page.',
    parameters: {
      type: 'object',
      properties: {
        viewId: {
          type: 'string',
          description: 'Zendesk view ID.',
        },
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 30.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination. Default 1.',
        },
      },
      required: ['viewId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { viewId, limit, page } = args as {
        viewId: string;
        limit?: number;
        page?: number;
      };

      const result = await zendeskRequest<any>(ctx, `/views/${viewId}/tickets.json`, {
        query: {
          per_page: Math.min(limit ?? 30, 100),
          page: page ?? 1,
        },
      });

      const tickets = (result.tickets ?? []).map((t: any) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        type: t.type,
        requesterId: t.requester_id,
        assigneeId: t.assignee_id,
        organizationId: t.organization_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        tags: t.tags ?? [],
      }));

      return {
        viewId,
        tickets,
        total: tickets.length,
        page: page ?? 1,
        hasMore: result.next_page != null,
      };
    },
  });
}
