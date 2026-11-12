import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * create-bucket — create a new bucket.
 */
export function registerCreateBucketTool(app: AgentApp): void {
  app.tool('create-bucket', {
    description:
      'Create a new bucket in MinIO. Returns { bucket, region, created }. Params: bucket (required, lowercase 3-63 chars), region? (default us-east-1).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket to create (lowercase, 3-63 chars).',
        },
        region: {
          type: 'string',
          description: 'Region for the bucket (optional, default: us-east-1).',
        },
      },
      required: ['bucket'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);
      const region = typeof a.region === 'string' ? a.region : 'us-east-1';

      const client = await getMinioClient(ctx);
      await client.makeBucket(bucket, region);

      return { bucket, region, created: true };
    },
  });
}
