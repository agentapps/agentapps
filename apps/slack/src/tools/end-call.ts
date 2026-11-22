import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface EndCallArgs {
  callId: string;
  duration?: number;
}

export function registerEndCallTool(app: AgentApp): void {
  app.tool('end-call', {
    description:
      'Mark a call as ended. Returns { callId, ended: true }. Not retryable. EXPERIMENTAL. Params: callId, duration? (seconds).',
    parameters: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'Slack call id.' },
        duration: { type: 'number', description: 'Call duration in seconds.' },
      },
      required: ['callId'],
    },
    // No tool here reopens a call once it is marked as ended.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { callId, duration } = args as unknown as EndCallArgs;
      if (typeof callId !== 'string' || callId.trim().length === 0) {
        throw new Error('callId must be a non-empty string.');
      }
      if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
        throw new Error('duration must be a non-negative number.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).calls.end(sanitiseBody({ id: callId, duration }) as any),
      );
      return { callId, ended: true, duration: duration ?? null };
    },
  });
}
