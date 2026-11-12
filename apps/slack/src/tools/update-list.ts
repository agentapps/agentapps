import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractList } from './_lists-helpers.js';
import { sanitiseBody, wrapSlackMutation } from './utils.js';

interface UpdateListArgs {
  listId: string;
  name?: string;
  description?: string;
  schema?: string;
  todoMode?: boolean;
}

export function registerUpdateListTool(app: AgentApp): void {
  app.tool('update-list', {
    description:
      'Update list metadata or schema. Partial: only fields provided are updated. Returns curated list. EXPERIMENTAL. Params: listId, name?, description?, schema? (JSON), todoMode?.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List id.' },
        name: { type: 'string', description: 'New name.' },
        description: { type: 'string', description: 'New description.' },
        schema: { type: 'string', description: 'New schema JSON array.' },
        todoMode: { type: 'boolean', description: 'Toggle todo mode.' },
      },
      required: ['listId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const a = args as unknown as UpdateListArgs;
      if (typeof a.listId !== 'string' || a.listId.trim().length === 0) {
        throw new Error('listId must be a non-empty string.');
      }
      let parsedSchema: unknown[] | undefined;
      if (typeof a.schema === 'string' && a.schema.trim().length > 0) {
        try {
          const parsed = JSON.parse(a.schema);
          if (!Array.isArray(parsed)) throw new Error('schema must parse to a JSON array.');
          parsedSchema = parsed;
        } catch (err) {
          throw new Error(
            `Invalid schema JSON: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const updates: Record<string, unknown> = {};
      if (a.name !== undefined) updates.name = a.name;
      if (a.description !== undefined) updates.description = a.description;
      if (parsedSchema) updates.schema = parsedSchema;
      if (a.todoMode !== undefined) updates.todo_mode = a.todoMode;
      if (Object.keys(updates).length === 0) {
        throw new Error('Provide at least one field to update.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackMutation(() =>
        (client as any).slackLists.update(sanitiseBody({ list_id: a.listId, ...updates }) as any),
      );
      return result?.list ? extractList(result.list) : extractList(result);
    },
  });
}
