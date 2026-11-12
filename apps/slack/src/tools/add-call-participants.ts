import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { parseParticipants } from './_calls-helpers.js';
import { wrapSlackMutation } from './utils.js';

interface AddCallParticipantsArgs {
  callId: string;
  users: string;
}

export function registerAddCallParticipantsTool(app: AgentApp): void {
  app.tool('add-call-participants', {
    description:
      'Add participants to an active call. users is a JSON array of {slackId|externalId, displayName?, avatarUrl?}. Returns { callId, added: count }. Not retryable. EXPERIMENTAL.',
    parameters: {
      type: 'object',
      properties: {
        callId: { type: 'string', description: 'Slack call id.' },
        users: {
          type: 'string',
          description:
            'JSON array of participants: [{"slackId":"U..."} or {"externalId":"ext-123","displayName":"…"}]',
        },
      },
      required: ['callId', 'users'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { callId, users } = args as unknown as AddCallParticipantsArgs;
      if (typeof callId !== 'string' || callId.trim().length === 0) {
        throw new Error('callId must be a non-empty string.');
      }
      const parsed = parseParticipants(users);
      if (parsed.length === 0) throw new Error('users must contain at least one participant.');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).calls.participants.add({ id: callId, users: parsed }),
      );
      return { callId, added: parsed.length, participants: parsed };
    },
  });
}
