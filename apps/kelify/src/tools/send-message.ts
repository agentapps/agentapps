import type { AgentApp } from '@agentapps/sdk';
import { kelifyRequest } from '../lib/kelify-client.js';

interface MessageResponse {
  conversation_id: string;
  title?: string;
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  };
  search_results?: {
    count: number;
    properties: Array<{
      id: string;
      title: string;
      address?: string;
      price: number;
      operation: string;
      home_type: string;
      rooms?: number;
      bathrooms?: number;
      size?: number;
      latitude?: number;
      longitude?: number;
      photos: string[];
      url: string;
    }>;
    search_params: Record<string, unknown>;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

/**
 * send-message — POST /v1/conversations/{conversation_id}/messages.
 *
 * Sends a user message to a conversation and receives an AI response with
 * property search results. Always uses non-streaming mode (streaming via SSE
 * is not supported in the tool context).
 */
export function registerSendMessageTool(app: AgentApp): void {
  app.tool('send-message', {
    description:
      'Send a user message to a conversation and receive an AI response with property search results. Returns { conversation_id, title, message, search_results, usage }. Params: conversation_id (required), message (required, 1-2000 chars).',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: {
          type: 'string',
          description: 'The conversation UUID to send the message to.',
        },
        message: {
          type: 'string',
          description: "The user's message to the AI assistant for property search (1-2000 chars).",
        },
      },
      required: ['conversation_id', 'message'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = args as Record<string, unknown>;
      const conversationId = String(a.conversation_id);
      const message = String(a.message);

      if (!conversationId) {
        throw new Error('conversation_id is required.');
      }
      if (!message || message.length === 0) {
        throw new Error('message is required and must be non-empty.');
      }
      if (message.length > 2000) {
        throw new Error('message must be at most 2000 characters.');
      }

      const result = await kelifyRequest<MessageResponse>(
        ctx,
        `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          body: { message, stream: false },
        },
      );

      return {
        conversation_id: result.conversation_id,
        title: result.title,
        message: result.message,
        search_results: result.search_results,
        usage: result.usage,
      };
    },
  });
}
