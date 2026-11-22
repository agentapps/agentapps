import type { AgentApp } from '@agentapps/sdk';
import * as Minio from 'minio';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * copy-object — copy an object within or between buckets.
 */
export function registerCopyObjectTool(app: AgentApp): void {
  app.tool('copy-object', {
    description:
      'Copy an object within or between MinIO buckets. Returns { success, source, destination }. Params: sourceBucket (required), sourceObject (required), destBucket (required), destObject (required).',
    parameters: {
      type: 'object',
      properties: {
        sourceBucket: {
          type: 'string',
          description: 'Source bucket name.',
        },
        sourceObject: {
          type: 'string',
          description: 'Source object name/path.',
        },
        destBucket: {
          type: 'string',
          description: 'Destination bucket name.',
        },
        destObject: {
          type: 'string',
          description: 'Destination object name/path.',
        },
      },
      required: ['sourceBucket', 'sourceObject', 'destBucket', 'destObject'],
    },
    annotations: {
      readOnlyHint: false,
      // Overwrites an object already at the destination.
      destructiveHint: true,
      idempotentHint: true,
      // The MinIO server is reached over the network.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const sourceBucket = String(a.sourceBucket);
      const sourceObject = String(a.sourceObject);
      const destBucket = String(a.destBucket);
      const destObject = String(a.destObject);

      const client = await getMinioClient(ctx);
      const conds = new Minio.CopyConditions();
      await client.copyObject(destBucket, destObject, `/${sourceBucket}/${sourceObject}`, conds);

      return {
        success: true,
        source: `${sourceBucket}/${sourceObject}`,
        destination: `${destBucket}/${destObject}`,
      };
    },
  });
}
