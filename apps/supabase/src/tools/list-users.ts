/**
 * list_users — list auth users in a Supabase project (requires service_role key).
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerListUsersTool(app: AgentApp): void {
  app.tool('list_users', {
    description:
      'List authentication users in your Supabase project. Requires a service_role key. Supports pagination via page and per_page parameters.',
    parameters: {
      type: 'object',
      properties: {
        page: {
          type: 'number',
          description: 'Page number (default 1).',
        },
        per_page: {
          type: 'number',
          description: 'Number of users per page (default 50).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const page = (args.page as number) || 1;
      const perPage = (args.per_page as number) || 50;

      const result = (await supabaseRequest(
        'GET',
        '/auth/v1/admin/users',
        {
          params: {
            page: String(page),
            per_page: String(perPage),
          },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
