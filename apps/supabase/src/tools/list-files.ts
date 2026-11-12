/**
 * list_files — list files in a Supabase storage bucket.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerListFilesTool(app: AgentApp): void {
  app.tool('list_files', {
    description:
      'List files in a Supabase storage bucket. Optionally filter by path prefix and paginate results.',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'The storage bucket name.',
        },
        path: {
          type: 'string',
          description: 'Path prefix to filter files (default "").',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of files to return (default 100).',
        },
        offset: {
          type: 'number',
          description: 'Number of files to skip (default 0).',
        },
      },
      required: ['bucket'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const bucket = args.bucket as string;
      const path = (args.path as string) || '';
      const limit = (args.limit as number) || 100;
      const offset = (args.offset as number) || 0;

      const result = (await supabaseRequest(
        'POST',
        `/storage/v1/object/list/${bucket}`,
        {
          body: { prefix: path, limit, offset },
        },
        ctx,
      )) as { data: unknown };

      return result.data;
    },
  });
}
