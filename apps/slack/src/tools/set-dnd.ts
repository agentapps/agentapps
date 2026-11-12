import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { tsToIso } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface SetDndArgs {
  numMinutes: number;
}

export function registerSetDndTool(app: AgentApp): void {
  app.tool('set-dnd', {
    description:
      'Turn on Do Not Disturb for the authenticated user for N minutes. Returns { snoozeEnabled, snoozeEndtime, snoozeRemaining }. Not retryable. Params: numMinutes (1-1440).',
    parameters: {
      type: 'object',
      properties: {
        numMinutes: {
          type: 'number',
          description: 'How long to snooze (in minutes). Min 1, max 1440 (24h).',
        },
      },
      required: ['numMinutes'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { numMinutes } = args as unknown as SetDndArgs;
      if (typeof numMinutes !== 'number' || !Number.isFinite(numMinutes)) {
        throw new Error('numMinutes must be a number.');
      }
      if (numMinutes < 1 || numMinutes > 1440) {
        throw new Error(`numMinutes must be between 1 and 1440 (got ${numMinutes}).`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        client.dnd.setSnooze({ num_minutes: numMinutes }),
      );
      return {
        snoozeEnabled: (result as any).snooze_enabled ?? true,
        snoozeEndtime: tsToIso((result as any).snooze_endtime),
        snoozeRemaining: (result as any).snooze_remaining ?? null,
      };
    },
  });
}
