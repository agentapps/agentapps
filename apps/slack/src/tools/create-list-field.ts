import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface CreateListFieldArgs {
  listId: string;
  name: string;
  type: string;
  required?: boolean;
}

const ALLOWED_TYPES = new Set([
  'text',
  'number',
  'date',
  'user',
  'checkbox',
  'select',
  'multi_select',
  'url',
  'email',
]);

export function registerCreateListFieldTool(app: AgentApp): void {
  app.tool('create-list-field', {
    description:
      'Add a new column to a Slack List schema. Returns the created field. Not retryable. EXPERIMENTAL. Params: listId, name, type (text|number|date|user|checkbox|select|multi_select|url|email), required (def false).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string' },
        name: { type: 'string', description: 'Column display name.' },
        type: {
          type: 'string',
          enum: [
            'text',
            'number',
            'date',
            'user',
            'checkbox',
            'select',
            'multi_select',
            'url',
            'email',
          ],
        },
        required: { type: 'boolean' },
      },
      required: ['listId', 'name', 'type'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { listId, name, type, required } = args as unknown as CreateListFieldArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0)
        throw new Error('listId required.');
      if (typeof name !== 'string' || name.trim().length === 0) throw new Error('name required.');
      if (!ALLOWED_TYPES.has(type)) {
        throw new Error(`type must be one of: ${Array.from(ALLOWED_TYPES).join(', ')}`);
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).slackLists.fields.create(
          sanitiseBody({ list_id: listId, name, type, is_required: required ?? false }) as any,
        ),
      );
      return result?.field ?? { listId, name, type, required: required ?? false };
    },
  });
}
