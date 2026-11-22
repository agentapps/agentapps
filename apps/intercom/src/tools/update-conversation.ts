import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * update-conversation — PUT /conversations/{conversationId}.
 */
export function registerUpdateConversationTool(app: AgentApp): void {
  app.tool('update-conversation', {
    description: 'Update a conversation state (open, close, snooze) or priority in Intercom.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Intercom conversation ID',
        },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'snoozed'],
          description: 'New state for the conversation',
        },
        priority: {
          type: 'string',
          enum: ['priority', 'not_priority'],
          description: 'Set or unset priority flag',
        },
        snoozedUntil: {
          type: 'number',
          description: 'Unix timestamp — required when state is "snoozed"',
        },
      },
      required: ['conversationId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { conversationId, state, priority, snoozedUntil } = args as {
        conversationId: string;
        state?: string;
        priority?: string;
        snoozedUntil?: number;
      };

      const body: Record<string, unknown> = {};
      if (state) body.state = state;
      if (priority) body.priority = priority;
      if (snoozedUntil) body.snoozed_until = snoozedUntil;

      return intercomRequest(ctx, `/conversations/${conversationId}`, {
        method: 'PUT',
        body,
      });
    },
  });
}
