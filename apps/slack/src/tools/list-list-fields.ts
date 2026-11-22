import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { wrapSlackCall } from './utils.js';

interface ListListFieldsArgs {
  listId: string;
  limit?: number;
  cursor?: string;
  includeRaw?: boolean;
}

interface CuratedListField {
  id: string;
  name: string;
  type: string;
  required: boolean;
  ordering: number | null;
}

export function registerListListFieldsTool(app: AgentApp): void {
  app.tool('list-list-fields', {
    description:
      'List the column schema of a Slack List as individual field objects. Returns { fields, count }. Retryable. EXPERIMENTAL. Params: listId.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List id.' },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { listId, includeRaw } = args as unknown as ListListFieldsArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0) {
        throw new Error('listId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        (client as any).slackLists.fields.list({ list_id: listId }),
      );
      if (includeRaw) return result;
      const raw = (result?.fields ?? result?.schema ?? []) as any[];
      const fields: CuratedListField[] = raw.map((f) => ({
        id: f?.id ?? f?.key ?? '',
        name: f?.name ?? '',
        type: f?.type ?? 'text',
        required: Boolean(f?.is_required ?? f?.required),
        ordering: typeof f?.ordering === 'number' ? f.ordering : null,
      }));
      return { listId, fields, count: fields.length };
    },
  });
}
