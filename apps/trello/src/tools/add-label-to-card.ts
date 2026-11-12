import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * add-label-to-card — POST /cards/{cardId}/idLabels.
 */
export function registerAddLabelToCardTool(app: AgentApp): void {
  app.tool('add-label-to-card', {
    description: 'Add a label to a Trello card. Params: cardId (required), labelId (required).',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID of card.' },
        labelId: { type: 'string', description: 'The ID of label to add.' },
      },
      required: ['cardId', 'labelId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const cardId = String(a.cardId);

      await trelloRequest(ctx, `/cards/${encodeURIComponent(cardId)}/idLabels`, {
        method: 'POST',
        body: { value: a.labelId },
      });

      return { added: true, cardId, labelId: a.labelId };
    },
  });
}
