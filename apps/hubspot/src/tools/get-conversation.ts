import type { AgentApp } from '@agentapps/sdk';
import { formatConversation, formatConversationMessage, hubspotRequest } from '../lib/index.js';

/**
 * get-conversation — GET /conversations/v3/conversations/{conversationId}.
 */
export function registerGetConversationTool(app: AgentApp): void {
  app.tool('get-conversation', {
    description:
      'Get a HubSpot conversation by ID, including messages. Params: conversationId, includeMessages?',
    parameters: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', description: 'HubSpot conversation ID.' },
        includeMessages: {
          type: 'boolean',
          description: 'Include messages in the response. Default true.',
        },
        limit: { type: 'number', description: 'Max messages to include. Default 50.' },
      },
      required: ['conversationId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        conversationId,
        includeMessages = true,
        limit = 50,
      } = args as {
        conversationId: string;
        includeMessages?: boolean;
        limit?: number;
      };

      const conversation = (await hubspotRequest(
        ctx,
        `/conversations/v3/conversations/${encodeURIComponent(conversationId)}`,
      )) as any;

      let messages: any[] = [];
      if (includeMessages) {
        try {
          const messagesData = (await hubspotRequest(
            ctx,
            `/conversations/v3/conversations/${encodeURIComponent(conversationId)}/messages`,
            { params: { limit: Math.min(limit, 100) } },
          )) as any;
          messages = (messagesData.results ?? []).map(formatConversationMessage);
        } catch {
          // Messages may not be available -- best effort
        }
      }

      return {
        ...formatConversation(conversation),
        messages,
        messageCount: messages.length,
      };
    },
  });
}
