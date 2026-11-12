import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteListArgs {
  listId: string;
}

export function registerDeleteListTool(app: AgentApp): void {
  app.tool('delete-list', {
    description:
      'Delete a Slack List (and all its items). Returns { listId, deleted: true }. Not retryable. EXPERIMENTAL. Params: listId.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List id.' },
      },
      required: ['listId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { listId } = args as unknown as DeleteListArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0) {
        throw new Error('listId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() => (client as any).slackLists.delete({ list_id: listId }));
      return { listId, deleted: true };
    },
  });
}
