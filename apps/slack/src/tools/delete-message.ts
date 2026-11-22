import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { validateChannelId, validateMessageTs } from './_helpers.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteMessageArgs {
  channel: string;
  ts: string;
  asUser?: boolean;
}

export function registerDeleteMessageTool(app: AgentApp): void {
  app.tool('delete-message', {
    description:
      'Delete a message. The token user must be author or workspace admin. Returns { channel, ts, deleted: true }. Not retryable. Params: channel, ts, asUser? (default true — deletes as the user; false impersonates the workspace).',
    parameters: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Channel id where the message lives.',
        },
        ts: {
          type: 'string',
          description: 'Timestamp of the message to delete.',
        },
        asUser: {
          type: 'boolean',
          description:
            'Delete as the authenticated user (default true). Set false only if the token has admin scope.',
        },
      },
      required: ['channel', 'ts'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { channel, ts, asUser } = args as unknown as DeleteMessageArgs;
      validateChannelId(channel, 'channel');
      validateMessageTs(ts, 'ts');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => client.chat.delete({ channel, ts, as_user: asUser ?? true }));
      return { channel, ts, deleted: true };
    },
  });
}
