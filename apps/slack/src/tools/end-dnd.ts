import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

export function registerEndDndTool(app: AgentApp): void {
  app.tool('end-dnd', {
    description: 'End the current snooze. Returns { snoozeEnabled: false }. Idempotent. No params.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (_args, ctx) => {
      const { client } = await getSlackSession(ctx);
      try {
        await wrapSlackMutation(() => client.dnd.endSnooze());
      } catch (e: any) {
        const msg = e?.upstreamMessage ?? e?.message ?? '';
        // Slack returns snooze_not_active when no snooze is set — treat as success.
        if (!msg.includes('snooze_not_active')) throw e;
      }
      return { snoozeEnabled: false };
    },
  });
}
