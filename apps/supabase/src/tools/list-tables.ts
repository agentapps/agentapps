/**
 * list_tables — list all available tables in the Supabase database.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerListTablesTool(app: AgentApp): void {
  app.tool('list_tables', {
    description:
      'List all available tables and views in the Supabase database by querying the PostgREST OpenAPI spec.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const result = (await supabaseRequest('GET', '/rest/v1/', null, ctx)) as {
        data: Record<string, unknown>;
      };

      const spec = result.data;
      const paths = (spec.paths ?? {}) as Record<string, unknown>;

      // Extract table names from paths: "/table_name" -> "table_name"
      const tables = Object.keys(paths)
        .filter((p) => p.startsWith('/'))
        .map((p) => p.slice(1))
        .filter((name) => name.length > 0)
        .sort();

      return { tables };
    },
  });
}
