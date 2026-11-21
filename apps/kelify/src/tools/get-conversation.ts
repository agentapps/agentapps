import type { AgentApp } from '@agentapps/sdk';
import { kelifyRequest } from '../lib/kelify-client.js';

interface ConversationDetails {
  conversation_id: string;
  created_at: string;
  updated_at?: string;
  title?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * get-conversation — GET /v1/conversations/{conversation_id}.
 *
 * Retrieves full conversation history including all messages, AI responses,
 * search results, and usage statistics.
 */
export function registerGetConversationTool(app: AgentApp): void {
  app.tool('get-conversation', {
    description:
      'Retrieve full conversation history including all messages, AI responses, search results, and usage statistics. Returns { conversation_id, created_at, updated_at, title, messages, usage }. Params: conversation_id (required).',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The conversation UUID to retrieve.',
        },
      },
      required: ['conversation_id'],
    },
    annotations: {
      sensitive: false,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const conversationId = String(a.conversation_id);

      if (!conversationId) {
        throw new Error('conversation_id is required.');
      }

      const result = await kelifyRequest<ConversationDetails>(
        ctx,
        `/v1/conversations/${encodeURIComponent(conversationId)}`,
      );

      return {
        conversation_id: result.conversation_id,
        created_at: result.created_at,
        updated_at: result.updated_at,
        title: result.title,
        messages: result.messages,
        usage: result.usage,
      };
    },
  });
}
