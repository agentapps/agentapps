import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface RemoveEmojiArgs {
  name: string;
}

export function registerRemoveEmojiTool(app: AgentApp): void {
  app.tool('remove-emoji', {
    description:
      'Remove a custom workspace emoji. Workspace admin only. Returns { name, removed: true }. Not retryable. Params: name (no colons).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Emoji name (no colons).' },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { name } = args as unknown as RemoveEmojiArgs;
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('name must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => (client as any).emoji.remove({ name }));
      return { name, removed: true };
    },
  });
}
