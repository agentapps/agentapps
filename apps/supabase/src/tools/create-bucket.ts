/**
 * create_bucket — create a new storage bucket in Supabase.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerCreateBucketTool(app: AgentApp): void {
  app.tool('create_bucket', {
    description:
      'Create a new storage bucket in your Supabase project. Specify a unique id/name and whether it should be publicly accessible.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Unique identifier for the bucket (used in URLs).',
        },
        name: {
          type: 'string',
          description: 'Display name for the bucket (defaults to the id if omitted).',
        },
        public: {
          type: 'boolean',
          description: 'Whether the bucket allows public access (default false).',
        },
      },
      required: ['id'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const id = args.id as string;
      const name = (args.name as string) || id;
      const isPublic = (args.public as boolean) ?? false;

      const result = (await supabaseRequest(
        'POST',
        '/storage/v1/bucket',
        {
          body: { id, name, public: isPublic },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
