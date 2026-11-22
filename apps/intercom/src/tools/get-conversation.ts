import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest, stripHtml } from '../lib/intercom-client.js';

/**
 * get-conversation — GET /conversations/{conversationId}.
 */
export function registerGetConversationTool(app: AgentApp): void {
  app.tool('get-conversation', {
    description:
      'Get the full details of a specific Intercom conversation by ID, including all messages, notes, tags, and assignee.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Intercom conversation ID',
        },
      },
      required: ['conversationId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { conversationId } = args as { conversationId: string };

      const c = await intercomRequest<Record<string, unknown>>(
        ctx,
        `/conversations/${conversationId}`,
      );

      const rawParts =
        ((c.conversation_parts as Record<string, unknown> | undefined)?.conversation_parts as Array<
          Record<string, unknown>
        >) ?? [];
      const parts = rawParts.map((p) => ({
        type: p.part_type,
        author: {
          type: (p.author as Record<string, unknown> | undefined)?.type,
          name: (p.author as Record<string, unknown> | undefined)?.name,
        },
        body: stripHtml((p.body as string) ?? ''),
        createdAt: p.created_at,
      }));

      const source = c.source as Record<string, unknown> | undefined;

      return {
        id: c.id,
        state: c.state,
        priority: c.priority,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        source: {
          type: source?.type,
          subject: source?.subject,
          body: stripHtml((source?.body as string) ?? ''),
          author: source?.author,
        },
        assignee: (c.assignee as Record<string, unknown> | undefined)?.name ?? null,
        team: (c.team_assignee as Record<string, unknown> | undefined)?.name ?? null,
        tags: (
          ((c.tags as Record<string, unknown> | undefined)?.tags as Array<
            Record<string, unknown>
          >) ?? []
        ).map((t) => t.name),
        parts,
      };
    },
  });
}
