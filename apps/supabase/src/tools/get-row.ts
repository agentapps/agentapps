/**
 * get_row — retrieve a single row from a Supabase table by column value.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerGetRowTool(app: AgentApp): void {
  app.tool('get_row', {
    description:
      'Get a single row from a Supabase table by matching a column value. Returns the row object directly.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name.',
        },
        column: {
          type: 'string',
          description: 'The column to filter on (e.g. "id").',
        },
        value: {
          type: 'string',
          description: 'The value to match (e.g. "123" or "user@example.com").',
        },
      },
      required: ['table', 'column', 'value'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const table = args.table as string;
      const column = args.column as string;
      const value = args.value as string;

      const result = (await supabaseRequest(
        'GET',
        `/rest/v1/${table}`,
        {
          params: {
            [column]: `eq.${value}`,
            limit: '1',
          },
          headers: {
            Accept: 'application/vnd.pgrst.object+json',
          },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
