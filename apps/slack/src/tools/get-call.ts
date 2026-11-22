import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractCall } from './_calls-helpers.js';
import { wrapSlackCall } from './utils.js';

interface GetCallArgs {
  callId: string;
  includeRaw?: boolean;
}

export function registerGetCallTool(app: AgentApp): void {
  app.tool('get-call', {
    description:
      'Get call details (participants, duration, status). Returns curated call. Retryable. EXPERIMENTAL. Params: callId.',
    parameters: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'Slack call id.' },
      },
      required: ['callId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { callId, includeRaw } = args as unknown as GetCallArgs;
      if (typeof callId !== 'string' || callId.trim().length === 0) {
        throw new Error('callId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => (client as any).calls.info({ id: callId }));
      if (includeRaw) return result;
      return extractCall(result?.call ?? result);
    },
  });
}
