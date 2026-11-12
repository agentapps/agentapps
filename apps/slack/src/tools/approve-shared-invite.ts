import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface ApproveSharedInviteArgs {
  inviteId: string;
  targetTeam?: string;
}

export function registerApproveSharedInviteTool(app: AgentApp): void {
  app.tool('approve-shared-invite', {
    description:
      'Approve a Slack Connect channel invite as a workspace admin (when admin approval is required by policy). Returns { inviteId, approved: true }. Not retryable. Params: inviteId, targetTeam? (Enterprise Grid).',
    parameters: {
      type: 'object',
      properties: {
        inviteId: { type: 'string', description: 'Invite id.' },
        targetTeam: { type: 'string', description: 'Target team id (Enterprise Grid).' },
      },
      required: ['inviteId'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const { inviteId, targetTeam } = args as unknown as ApproveSharedInviteArgs;
      if (typeof inviteId !== 'string' || inviteId.trim().length === 0) {
        throw new Error('inviteId must be a non-empty string.');
      }
      const { botClient: client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).conversations.approveSharedInvite(
          sanitiseBody({ invite_id: inviteId, target_team: targetTeam }) as any,
        ),
      );
      return { inviteId, approved: true };
    },
  });
}
