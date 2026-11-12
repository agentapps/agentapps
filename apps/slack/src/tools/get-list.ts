import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { extractList } from './_lists-helpers.js';
import { wrapSlackCall } from './utils.js';

interface GetListArgs {
  listId: string;
  includeRaw?: boolean;
}

export function registerGetListTool(app: AgentApp): void {
  app.tool('get-list', {
    description:
      'Get list details + schema. Returns curated list. Retryable. EXPERIMENTAL. Params: listId.',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'List id.' },
      },
      required: ['listId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { listId, includeRaw } = args as unknown as GetListArgs;
      if (typeof listId !== 'string' || listId.trim().length === 0) {
        throw new Error('listId must be a non-empty string.');
      }
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        (client as any).slackLists.info({ list_id: listId }),
      );
      if (includeRaw) return result;
      return result?.list ? extractList(result.list) : extractList(result);
    },
  });
}
