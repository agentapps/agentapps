import type { AgentApp } from '@agentapps/sdk';
import { kelifyRequest } from '../lib/kelify-client.js';

interface CreateConversationResponse {
  conversation_id: string;
  created_at: string;
}

/**
 * create-conversation — POST /v1/conversations.
 *
 * Creates a new conversation session for property search. Each conversation
 * maintains context across multiple messages, allowing for natural follow-up
 * questions.
 */
export function registerCreateConversationTool(app: AgentApp): void {
  app.tool('create-conversation', {
    description:
      'Create a new conversation session for property search. Each conversation maintains context across multiple messages, allowing for natural follow-up questions. Returns { conversation_id, created_at }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const result = await kelifyRequest<CreateConversationResponse>(ctx, '/v1/conversations', {
        method: 'POST',
      });

      return {
        conversation_id: result.conversation_id,
        created_at: result.created_at,
      };
    },
  });
}
