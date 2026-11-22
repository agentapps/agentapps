/**
 * list-buckets — list all storage buckets in Supabase.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerListBucketsTool(app: AgentApp): void {
  app.tool('list-buckets', {
    description:
      'List all storage buckets in your Supabase project. Returns bucket metadata including name, id, and public status.',
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
      const result = (await supabaseRequest('GET', '/storage/v1/bucket', null, ctx)) as {
        data: unknown;
      };

      return result.data;
    },
  });
}
