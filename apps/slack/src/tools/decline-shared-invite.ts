import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface DeclineSharedInviteArgs {
  inviteId: string;
  targetTeam?: string;
}

export function registerDeclineSharedInviteTool(app: AgentApp): void {
  app.tool('decline-shared-invite', {
    description:
      'Decline a Slack Connect channel invite. Returns { inviteId, declined: true }. Not retryable. Params: inviteId, targetTeam? (override target team id).',
    parameters: {
      type: 'object',
      properties: {
        inviteId: { type: 'string', description: 'Invite id.' },
        targetTeam: { type: 'string', description: 'Target team id (Enterprise Grid).' },
      },
      required: ['inviteId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { inviteId, targetTeam } = args as unknown as DeclineSharedInviteArgs;
      if (typeof inviteId !== 'string' || inviteId.trim().length === 0) {
        throw new Error('inviteId must be a non-empty string.');
      }
      const { botClient: client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).conversations.declineSharedInvite(
          sanitiseBody({ invite_id: inviteId, target_team: targetTeam }) as any,
        ),
      );
      return { inviteId, declined: true };
    },
  });
}
