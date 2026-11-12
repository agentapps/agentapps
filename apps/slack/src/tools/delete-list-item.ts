import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteListItemArgs {
  listId: string;
  itemId: string;
}

export function registerDeleteListItemTool(app: AgentApp): void {
  app.tool('delete-list-item', {
    description:
      'Delete a list item. Returns { listId, itemId, deleted: true }. Not retryable. EXPERIMENTAL. Params: listId, itemId.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List id.' },
        itemId: { type: 'string', description: 'Item id.' },
      },
      required: ['listId', 'itemId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { listId, itemId } = args as unknown as DeleteListItemArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0) {
        throw new Error('listId must be a non-empty string.');
      }
      if (typeof itemId !== 'string' || itemId.trim().length === 0) {
        throw new Error('itemId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).slackLists.items.delete({ list_id: listId, item_id: itemId }),
      );
      return { listId, itemId, deleted: true };
    },
  });
}
