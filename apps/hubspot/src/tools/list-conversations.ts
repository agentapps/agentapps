import type { AgentApp } from '@agentapps/sdk';
import { formatConversation, hubspotRequest } from '../lib/index.js';

/**
 * list-conversations — GET /conversations/v3/conversations.
 */
export function registerListConversationsTool(app: AgentApp): void {
  app.tool('list-conversations', {
    description:
      'List HubSpot conversations (inbox) with optional filters. Returns curated rows. Params: limit?, after?, status?',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Results per page. Max 100, default 50.' },
        after: { type: 'string', description: 'Pagination cursor.' },
        status: {
          type: 'string',
          description: 'Filter by status: OPEN, CLOSED, WAITING.',
          enum: ['OPEN', 'CLOSED', 'WAITING'],
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
        status,
      } = (args ?? {}) as {
        limit?: number;
        after?: string;
        status?: 'OPEN' | 'CLOSED' | 'WAITING';
      };

      const params: Record<string, any> = {
        limit: Math.min(Math.max(limit, 1), 100),
      };
      if (after) params.after = after;
      if (status) params.status = status;

      const data = (await hubspotRequest(ctx, '/conversations/v3/conversations', {
        params,
      })) as any;

      return {
        conversations: (data.results ?? []).map(formatConversation),
        total: data.results?.length ?? 0,
        hasMore: !!data.paging?.next?.after,
        nextCursor: data.paging?.next?.after ?? null,
      };
    },
  });
}
