import type { AgentApp } from '@agentapps/sdk';
import { wahaFetch } from '../lib/api.js';

export function registerReactionTool(app: AgentApp): void {
  app.tool('reaction', {
    description: 'Send or remove a reaction (emoji) to a WhatsApp message.',
    parameters: {
      type: 'object',
      properties: {
        session: {
          type: 'string',
          description: 'Session name (default: "default")',
        },
        messageId: {
          type: 'string',
          description: 'ID of the message to react to',
        },
        reaction: {
          type: 'string',
          description:
            'Emoji to react with (e.g. thumbs up). Pass empty string "" to remove a reaction.',
        },
      },
      required: ['messageId', 'reaction'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        session = 'default',
        messageId,
        reaction,
      } = args as {
        session?: string;
        messageId: string;
        reaction: string;
      };
      const res = await wahaFetch(ctx, '/reaction', {
        method: 'PUT',
        body: JSON.stringify({ session, messageId, reaction }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          success: false,
          status: res.status,
          error: `WAHA returned HTTP ${res.status}`,
          detail: err,
        };
      }
      if (res.status === 204) return { success: true };
      return await res.json().catch(() => ({ success: true }));
    },
  });
}
