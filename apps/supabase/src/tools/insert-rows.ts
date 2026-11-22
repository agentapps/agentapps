/**
 * insert_rows — insert one or more rows into a Supabase table.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerInsertRowsTool(app: AgentApp): void {
  app.tool('insert_rows', {
    description:
      'Insert one or more rows into a Supabase table. Pass an array of row objects. Returns the inserted rows.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name to insert into.',
        },
        rows: {
          type: 'array',
          description: 'Array of row objects to insert.',
          items: { type: 'object' },
        },
      },
      required: ['table', 'rows'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const table = args.table as string;
      const rows = args.rows as Record<string, unknown>[];

      const result = (await supabaseRequest(
        'POST',
        `/rest/v1/${table}`,
        {
          body: rows,
          headers: { Prefer: 'return=representation' },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
