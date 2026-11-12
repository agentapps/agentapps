import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * add-comment — POST /cards/{cardId}/actions/comments.
 */
export function registerAddCommentTool(app: AgentApp): void {
  app.tool('add-comment', {
    description: 'Add a comment to a Trello card. Params: cardId (required), text (required).',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID of card.' },
        text: { type: 'string', description: 'The comment text.' },
      },
      required: ['cardId', 'text'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const cardId = String(a.cardId);

      const comment = await trelloRequest(
        ctx,
        `/cards/${encodeURIComponent(cardId)}/actions/comments`,
        { method: 'POST', body: { text: a.text } },
      );

      return comment;
    },
  });
}
