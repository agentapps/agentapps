/**
 * get_public_url — construct the public URL for a file in a Supabase storage bucket.
 */

import type { AgentApp } from '@agentapps/sdk';
import { getSupabaseConfig } from '../lib/supabase-client.js';

export function registerGetPublicUrlTool(app: AgentApp): void {
  app.tool('get_public_url', {
    description:
      'Get the public URL for a file in a Supabase storage bucket. The bucket must have public access enabled for the URL to work without authentication.',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'The storage bucket name.',
        },
        path: {
          type: 'string',
          description: 'The file path within the bucket.',
        },
      },
      required: ['bucket', 'path'],
    },
    // Builds the URL from the configured project URL: no request leaves the app process.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const bucket = args.bucket as string;
      const path = args.path as string;

      const { url } = await getSupabaseConfig(ctx);

      return {
        url: `${url}/storage/v1/object/public/${bucket}/${path}`,
      };
    },
  });
}
