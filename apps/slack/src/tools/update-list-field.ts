import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface UpdateListFieldArgs {
  listId: string;
  fieldId: string;
  name?: string;
  required?: boolean;
}

export function registerUpdateListFieldTool(app: AgentApp): void {
  app.tool('update-list-field', {
    description:
      'Rename a list column or toggle required. type is immutable. Returns the updated field. Not retryable. EXPERIMENTAL. Params: listId, fieldId, name?, required?.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string' },
        fieldId: { type: 'string' },
        name: { type: 'string' },
        required: { type: 'boolean' },
      },
      required: ['listId', 'fieldId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { listId, fieldId, name, required } = args as unknown as UpdateListFieldArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0)
        throw new Error('listId required.');
      if (typeof fieldId !== 'string' || fieldId.trim().length === 0)
        throw new Error('fieldId required.');
      if (name === undefined && required === undefined) {
        throw new Error('Provide at least one field to update.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).slackLists.fields.update(
          sanitiseBody({
            list_id: listId,
            field_id: fieldId,
            name,
            is_required: required,
          }) as any,
        ),
      );
      return result?.field ?? { listId, fieldId };
    },
  });
}
