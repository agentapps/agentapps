import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * tag-conversation — POST/DELETE /conversations/{conversationId}/tags.
 */
export function registerTagConversationTool(app: AgentApp): void {
  app.tool('tag-conversation', {
    description: 'Add or remove tags from an Intercom conversation.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Intercom conversation ID',
        },
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag IDs to add to the conversation',
        },
        removeTagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag IDs to remove from the conversation',
        },
      },
      required: ['conversationId'],
    },
    // Removing a tag is undone by adding it again, so not destructive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        conversationId,
        tagIds = [],
        removeTagIds = [],
      } = args as {
        conversationId: string;
        tagIds?: string[];
        removeTagIds?: string[];
      };

      const me = await intercomRequest<Record<string, unknown>>(ctx, '/me');
      const adminId = me.id as string;

      const results: unknown[] = [];

      for (const tagId of tagIds) {
        const result = await intercomRequest(ctx, `/conversations/${conversationId}/tags`, {
          method: 'POST',
          body: { id: tagId, admin_id: adminId },
        });
        results.push({ action: 'added', tagId, result });
      }

      for (const tagId of removeTagIds) {
        const result = await intercomRequest(
          ctx,
          `/conversations/${conversationId}/tags/${tagId}`,
          {
            method: 'DELETE',
            body: { admin_id: adminId },
          },
        );
        results.push({ action: 'removed', tagId, result });
      }

      return { success: true, operations: results };
    },
  });
}
