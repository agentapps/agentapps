/**
 * update_rows — update rows in a Supabase table matching a filter.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerUpdateRowsTool(app: AgentApp): void {
  app.tool('update_rows', {
    description:
      'Update rows in a Supabase table that match the given filter. Returns the updated rows.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name to update.',
        },
        filter: {
          type: 'string',
          description:
            'PostgREST filter to select rows to update (e.g. "id=eq.123"). Required to avoid updating all rows.',
        },
        data: {
          type: 'object',
          description: 'Object with column names and new values to set.',
        },
      },
      required: ['table', 'filter', 'data'],
    },
    // Sets columns to given values on the rows matching the filter: repeating it changes nothing
    // more. Treated as a field update (not destructive), although the old values are not kept.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const table = args.table as string;
      const filter = args.filter as string;
      const data = args.data as Record<string, unknown>;

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
        'PATCH',
        `/rest/v1/${table}`,
        {
          body: data,
          params,
          headers: { Prefer: 'return=representation' },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
