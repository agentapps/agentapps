import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackMutation } from './utils.js';

interface DeleteListFieldArgs {
  listId: string;
  fieldId: string;
}

export function registerDeleteListFieldTool(app: AgentApp): void {
  app.tool('delete-list-field', {
    description:
      'Delete a column from a Slack List schema (all values in items are also dropped). Returns { listId, fieldId, deleted: true }. Not retryable. EXPERIMENTAL. Params: listId, fieldId.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string' },
        fieldId: { type: 'string' },
      },
      required: ['listId', 'fieldId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, destructiveHint: true },
    handler: async (args, ctx) => {
      const { listId, fieldId } = args as unknown as DeleteListFieldArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0)
        throw new Error('listId required.');
      if (typeof fieldId !== 'string' || fieldId.trim().length === 0)
        throw new Error('fieldId required.');
      const { client } = await getSlackSession(ctx);
      await wrapSlackMutation(() =>
        (client as any).slackLists.fields.delete({ list_id: listId, field_id: fieldId }),
      );
      return { listId, fieldId, deleted: true };
    },
  });
}
