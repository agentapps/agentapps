/**
 * rpc — call a Supabase database function (RPC).
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerRpcTool(app: AgentApp): void {
  app.tool('rpc', {
    description:
      'Call a Supabase database function via PostgREST RPC. Pass the function name and an optional object of named parameters.',
    parameters: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'The database function name to call.',
        },
        params: {
          type: 'object',
          description: 'Named parameters to pass to the function (default {}).',
        },
      },
      required: ['functionName'],
    },
    // Runs any database function by name: it can delete or overwrite data, so it is annotated for
    // the most dangerous thing a function can do.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const functionName = args.functionName as string;
      const params = (args.params as Record<string, unknown>) || {};

      const result = (await supabaseRequest(
        'POST',
        `/rest/v1/rpc/${functionName}`,
        {
          body: params,
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
