import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * delete-object — delete an object from a bucket. IRREVERSIBLE.
 */
export function registerDeleteObjectTool(app: AgentApp): void {
  app.tool('delete-object', {
    description:
      'Delete an object from a MinIO bucket. IRREVERSIBLE. Returns { bucket, objectName, deleted }. Params: bucket (required), objectName (required).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket.',
        },
        objectName: {
          type: 'string',
          description: 'Name/path of the object to delete.',
        },
      },
      required: ['bucket', 'objectName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      // The MinIO server is reached over the network.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);
      const objectName = String(a.objectName);

      const client = await getMinioClient(ctx);
      await client.removeObject(bucket, objectName);

      return { bucket, objectName, deleted: true };
    },
  });
}
