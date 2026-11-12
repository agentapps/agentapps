import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * get-presigned-url — generate a presigned URL for temporary access to an object.
 */
export function registerGetPresignedUrlTool(app: AgentApp): void {
  app.tool('get-presigned-url', {
    description:
      'Generate a presigned URL for temporary access to a MinIO object. Returns { bucket, objectName, method, url, expirySeconds, expiresAt }. Params: bucket (required), objectName (required), expiry? (seconds, default 3600 = 1 hour, max 604800 = 7 days), method? (GET or PUT, default GET).',
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
        expiry: {
          type: 'number',
          description: 'URL expiry time in seconds (default: 3600 = 1 hour, max: 604800 = 7 days).',
        },
        method: {
          type: 'string',
          description: 'HTTP method: GET (download) or PUT (upload).',
          enum: ['GET', 'PUT'],
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
      const expiry = Math.min(
        typeof a.expiry === 'number' && a.expiry > 0 ? Math.floor(a.expiry) : 3600,
        604800,
      );
      const method = a.method === 'PUT' ? 'PUT' : 'GET';

      const client = await getMinioClient(ctx);

      let url: string;
      if (method === 'PUT') {
        url = await client.presignedPutObject(bucket, objectName, expiry);
      } else {
        url = await client.presignedGetObject(bucket, objectName, expiry);
      }

      const expiresAt = new Date(Date.now() + expiry * 1000);

      return {
        bucket,
        objectName,
        method,
        url,
        expirySeconds: expiry,
        expiresAt: expiresAt.toISOString(),
      };
    },
  });
}
