import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId } from './_helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface InviteSharedArgs {
  channel: string;
  emails?: string;
  userIds?: string;
  externalLimited?: boolean;
}

export function registerInviteSharedTool(app: AgentApp): void {
  app.tool('invite-shared', {
    description:
      'Send Slack Connect invite to share a channel with external user(s). Provide emails (csv) OR userIds (csv). Returns { channel, inviteId, link }. Not retryable. Params: channel, emails? | userIds?, externalLimited (def false).',
    parameters: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel id to share.' },
        emails: { type: 'string', description: 'Comma-separated emails of external users.' },
        userIds: {
          type: 'string',
          description: 'Comma-separated user ids (if user already in Slack).',
        },
        externalLimited: {
          type: 'boolean',
          description:
            'Limit invite to external-only (no internal accidental clicks). Default false.',
        },
      },
      required: ['channel'],
    },
    // Sends an invitation to people outside the workspace: a send cannot be undone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, emails, userIds, externalLimited } = args as unknown as InviteSharedArgs;
      validateChannelId(channel, 'channel');
      if (!emails && !userIds) {
        throw new Error('Provide emails or userIds.');
      }
      const { botClient: client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).conversations.inviteShared(
          sanitiseBody({
            channel,
            emails: emails
              ? emails
                  .split(',')
                  .map((e) => e.trim())
                  .filter(Boolean)
              : undefined,
            user_ids: userIds
              ? userIds
                  .split(',')
                  .map((u) => u.trim())
                  .filter(Boolean)
              : undefined,
            external_limited: externalLimited ?? false,
          }) as any,
        ),
      );
      return {
        channel,
        inviteId: (result as any).invite_id ?? '',
        link: (result as any).url ?? null,
        isLegacySharedChannel: (result as any).is_legacy_shared_channel ?? false,
      };
    },
  });
}
