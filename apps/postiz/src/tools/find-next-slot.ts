import type { AgentApp } from '@agentapps/sdk';
import { type Args, readId } from '../lib/args.js';
import { apiRequest } from '../lib/client.js';

export function registerFindNextSlotTool(app: AgentApp): void {
  /** @spec POSTIZ-REQ-4 */
  app.tool('find-next-slot', {
    description:
      'Find the next free posting slot of a channel. Returns { channelId, date } with the date in UTC ISO format. Pass that date to schedule-post.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: ['string', 'number'], description: 'Channel id, from list-channels.' },
      },
      required: ['channelId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Args;
      const channelId = readId(a.channelId, 'channelId');
      const slot = await apiRequest<{ date?: string }>('GET', `/find-slot/${channelId}`, ctx);
      // Postiz answers in UTC, and a live instance sends no zone ("2026-11-24T02:00:00"):
      // without one, the date would be read as local time when passed to schedule-post.
      const raw = typeof slot?.date === 'string' ? slot.date : null;
      const date = raw && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw) ? `${raw}Z` : raw;
      return { channelId, date };
    },
  });
}
