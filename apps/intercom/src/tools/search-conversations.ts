import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * search-conversations — POST /conversations/search.
 */
export function registerSearchConversationsTool(app: AgentApp): void {
  app.tool('search-conversations', {
    description:
      'Search conversations in Intercom with filters by state, date range, tags, and assignee. Returns paginated results with conversation metadata.',
    parameters: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['open', 'closed', 'snoozed'],
          description: 'Filter by conversation state',
        },
        createdAfter: {
          type: 'number',
          description: 'Unix timestamp — only conversations created after this time',
        },
        createdBefore: {
          type: 'number',
          description: 'Unix timestamp — only conversations created before this time',
        },
        assigneeId: {
          type: 'string',
          description: 'Filter by assigned admin ID',
        },
        teamId: {
          type: 'string',
          description: 'Filter by assigned team ID',
        },
        perPage: {
          type: 'number',
          description: 'Results per page (default: 20, max: 50)',
        },
        startingAfter: {
          type: 'string',
          description: 'Pagination cursor from previous response',
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
      const state = a.state as string | undefined;
      const createdAfter = a.createdAfter as number | undefined;
      const createdBefore = a.createdBefore as number | undefined;
      const assigneeId = a.assigneeId as string | undefined;
      const teamId = a.teamId as string | undefined;
      const perPage = typeof a.perPage === 'number' ? a.perPage : 20;
      const startingAfter = a.startingAfter as string | undefined;

      const conditions: unknown[] = [];

      if (state) conditions.push({ field: 'state', operator: '=', value: state });
      if (createdAfter)
        conditions.push({ field: 'created_at', operator: '>', value: createdAfter });
      if (createdBefore)
        conditions.push({ field: 'created_at', operator: '<', value: createdBefore });
      if (assigneeId) conditions.push({ field: 'assignee_id', operator: '=', value: assigneeId });
      if (teamId) conditions.push({ field: 'team_assignee_id', operator: '=', value: teamId });

      const query =
        conditions.length === 1
          ? conditions[0]
          : conditions.length > 1
            ? { operator: 'AND', value: conditions }
            : {};

      const pagination: Record<string, unknown> = { per_page: Math.min(perPage, 50) };
      if (startingAfter) pagination.starting_after = startingAfter;

      const result = await intercomRequest<Record<string, unknown>>(ctx, '/conversations/search', {
        method: 'POST',
        body: { query, pagination },
      });

      const conversations = (result.conversations as Array<Record<string, unknown>>) ?? [];
      return {
        totalPages: (result.pages as Record<string, unknown> | undefined)?.total_pages,
        nextCursor:
          (
            (result.pages as Record<string, unknown> | undefined)?.next as
              | Record<string, unknown>
              | undefined
          )?.starting_after ?? null,
        count: conversations.length,
        conversations: conversations.map((c) => ({
          id: c.id,
          state: c.state,
          priority: c.priority,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          source: (c.source as Record<string, unknown> | undefined)?.type,
          subject: (c.source as Record<string, unknown> | undefined)?.subject,
          assignee: (c.assignee as Record<string, unknown> | undefined)?.name ?? null,
          team: (c.team_assignee as Record<string, unknown> | undefined)?.name ?? null,
          tags: (
            ((c.tags as Record<string, unknown> | undefined)?.tags as Array<
              Record<string, unknown>
            >) ?? []
          ).map((t) => t.name),
        })),
      };
    },
  });
}
