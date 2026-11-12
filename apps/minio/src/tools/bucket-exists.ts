import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * bucket-exists — check if a bucket exists.
 */
export function registerBucketExistsTool(app: AgentApp): void {
  app.tool('bucket-exists', {
    description:
      'Check if a bucket exists in MinIO. Returns { bucket, exists }. Params: bucket (required).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket to check.',
        },
      },
      required: ['bucket'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);

      const client = await getMinioClient(ctx);
      const exists = await client.bucketExists(bucket);

      return { bucket, exists };
    },
  });
}
