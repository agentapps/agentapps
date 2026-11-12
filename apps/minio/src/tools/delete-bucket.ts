import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * delete-bucket — delete a bucket (must be empty). IRREVERSIBLE.
 */
export function registerDeleteBucketTool(app: AgentApp): void {
  app.tool('delete-bucket', {
    description:
      'Delete a bucket from MinIO (must be empty). IRREVERSIBLE. Returns { bucket, deleted }. Params: bucket (required).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket to delete.',
        },
      },
      required: ['bucket'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);

      const client = await getMinioClient(ctx);
      await client.removeBucket(bucket);

      return { bucket, deleted: true };
    },
  });
}
