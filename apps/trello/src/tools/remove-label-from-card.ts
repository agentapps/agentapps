import type { AgentApp } from '@agentapps/sdk';
import { trelloRequest } from '../lib/trello-client.js';

/**
 * remove-label-from-card — DELETE /cards/{cardId}/idLabels/{labelId}.
 */
export function registerRemoveLabelFromCardTool(app: AgentApp): void {
  app.tool('remove-label-from-card', {
    description:
      'Remove a label from a Trello card. Params: cardId (required), labelId (required).',
    parameters: {
      type: 'object',
      properties: {
        cardId: { type: 'string', description: 'The ID of card.' },
        labelId: { type: 'string', description: 'The ID of label to remove.' },
      },
      required: ['cardId', 'labelId'],
    },
    annotations: {
      readOnlyHint: false,
      // Detaches the label from the card only; add-label-to-card puts it back.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const cardId = String(a.cardId);
      const labelId = String(a.labelId);

      await trelloRequest(
        ctx,
        `/cards/${encodeURIComponent(cardId)}/idLabels/${encodeURIComponent(labelId)}`,
        { method: 'DELETE' },
      );

      return { removed: true, cardId, labelId };
    },
  });
}
