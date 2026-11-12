import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-tickets — GET /tickets.json.
 */
export function registerListTicketsTool(app: AgentApp): void {
  app.tool('list-tickets', {
    description:
      'List Zendesk tickets with optional filters. Returns curated rows { id, subject, status, priority, requester, assignee, createdAt, updatedAt }. Params: status?, priority?, assigneeId?, requesterId?, organizationId?, limit (1-100, def 30), page.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
          description: 'Filter by ticket status.',
        },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low'],
          description: 'Filter by ticket priority.',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter by assignee user ID.',
        },
        requesterId: {
          type: 'string',
          description: 'Filter by requester user ID.',
        },
        organizationId: {
          type: 'string',
          description: 'Filter by organization ID.',
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
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const status = a.status as string | undefined;
      const priority = a.priority as string | undefined;
      const assigneeId = a.assigneeId as string | undefined;
      const requesterId = a.requesterId as string | undefined;
      const organizationId = a.organizationId as string | undefined;
      const limit = typeof a.limit === 'number' ? a.limit : 30;
      const page = typeof a.page === 'number' ? a.page : 1;

      const query: Record<string, string | number | undefined> = {
        per_page: Math.min(limit, 100),
        page,
      };
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (assigneeId) query.assignee_id = assigneeId;
      if (requesterId) query.requester_id = requesterId;
      if (organizationId) query.organization_id = organizationId;

      const result = await zendeskRequest<any>(ctx, '/tickets.json', { query });

      const tickets = (result.tickets ?? []).map((t: any) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        type: t.type,
        requesterId: t.requester_id,
        assigneeId: t.assignee_id,
        organizationId: t.organization_id,
        groupId: t.group_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        tags: t.tags ?? [],
      }));

      return {
        tickets,
        total: tickets.length,
        page,
        hasMore: result.next_page != null,
      };
    },
  });
}
