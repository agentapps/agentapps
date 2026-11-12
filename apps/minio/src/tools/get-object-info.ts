import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * get-object-info — get metadata/info about an object (size, type, etag, etc.).
 */
export function registerGetObjectInfoTool(app: AgentApp): void {
  app.tool('get-object-info', {
    description:
      'Get metadata/info about a MinIO object (size, type, etag, last modified, etc.). Returns { bucket, objectName, size, etag, lastModified, metaData, versionId }. Params: bucket (required), objectName (required).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket.',
        },
        objectName: {
          type: 'string',
          description: 'Name/path of the object.',
        },
      },
      required: ['bucket', 'objectName'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);
      const objectName = String(a.objectName);

      const client = await getMinioClient(ctx);
      const stat = await client.statObject(bucket, objectName);

      return {
        bucket,
        objectName,
        size: stat.size,
        etag: stat.etag,
        lastModified: stat.lastModified?.toISOString(),
        metaData: stat.metaData,
        versionId: stat.versionId,
      };
    },
  });
}
