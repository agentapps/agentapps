import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * list-buckets — list all buckets in the MinIO server.
 */
export function registerListBucketsTool(app: AgentApp): void {
  app.tool('list-buckets', {
    description:
      'List all buckets in the MinIO server. Returns { buckets: [{ name, creationDate }] }.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      // The MinIO server is reached over the network.
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const client = await getMinioClient(ctx);
      const buckets = await client.listBuckets();

      return {
        buckets: buckets.map((bucket) => ({
          name: bucket.name,
          creationDate: bucket.creationDate?.toISOString(),
        })),
      };
    },
  });
}
