import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { parseParticipants } from './_calls-helpers.js';
import { wrapSlackMutation } from './utils.js';

interface RemoveCallParticipantsArgs {
  callId: string;
  users: string;
}

export function registerRemoveCallParticipantsTool(app: AgentApp): void {
  app.tool('remove-call-participants', {
    description:
      'Remove participants from a call. users is a JSON array of {slackId|externalId}. Returns { callId, removed: count }. Not retryable. EXPERIMENTAL.',
    parameters: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'Slack call id.' },
        users: { type: 'string', description: 'JSON array of participants to remove.' },
      },
      required: ['callId', 'users'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { callId, users } = args as unknown as RemoveCallParticipantsArgs;
      if (typeof callId !== 'string' || callId.trim().length === 0) {
        throw new Error('callId must be a non-empty string.');
      }
      const parsed = parseParticipants(users);
      if (parsed.length === 0) throw new Error('users must contain at least one participant.');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).calls.participants.remove({ id: callId, users: parsed }),
      );
      return { callId, removed: parsed.length, participants: parsed };
    },
  });
}
