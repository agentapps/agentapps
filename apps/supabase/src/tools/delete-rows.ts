/**
 * delete-rows — delete rows from a Supabase table matching a filter.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerDeleteRowsTool(app: AgentApp): void {
  app.tool('delete-rows', {
    description:
      'Delete rows from a Supabase table that match the given filter. A filter is required to prevent accidental deletion of all rows. Returns the deleted rows.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name to delete from.',
        },
        filter: {
          type: 'string',
          description:
            'PostgREST filter to select rows to delete (e.g. "id=eq.123"). MUST be provided.',
        },
      },
      required: ['table', 'filter'],
    },
    // Repeating the same filter finds the rows already gone, so the call is idempotent.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const table = args.table as string;
      const filter = args.filter as string;

      // Parse filter string into query params
      const params: Record<string, string> = {};
      const filterParts = filter.split('&');
      for (const part of filterParts) {
        const eqIndex = part.indexOf('=');
        if (eqIndex > 0) {
          const key = part.slice(0, eqIndex);
          const value = part.slice(eqIndex + 1);
          params[key] = value;
        }
      }

      const result = (await supabaseRequest(
        'DELETE',
        `/rest/v1/${table}`,
        {
          params,
          headers: { Prefer: 'return=representation' },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
