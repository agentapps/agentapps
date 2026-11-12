import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';
import { streamToArray } from './_helpers.js';

/**
 * list-objects — list objects in a bucket with optional prefix filter.
 */
export function registerListObjectsTool(app: AgentApp): void {
  app.tool('list-objects', {
    description:
      'List objects in a MinIO bucket with optional prefix filter. Returns { bucket, prefix, count, totalFound, objects: [{ name, size, etag, lastModified, isDir }] }. Params: bucket (required), prefix?, recursive? (default true), limit? (default 100).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket.',
        },
        prefix: {
          type: 'string',
          description: 'Filter objects by prefix/folder (optional).',
        },
        recursive: {
          type: 'boolean',
          description: 'List recursively (default: true).',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of objects to return (default: 100).',
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
      const prefix = typeof a.prefix === 'string' ? a.prefix : '';
      const recursive = a.recursive !== false;
      const limit = typeof a.limit === 'number' && a.limit > 0 ? Math.floor(a.limit) : 100;

      const client = await getMinioClient(ctx);
      const objectsStream = client.listObjects(bucket, prefix, recursive);
      const allObjects = await streamToArray(objectsStream);
      const objects = allObjects.slice(0, limit);

      return {
        bucket,
        prefix: prefix || '(root)',
        count: objects.length,
        totalFound: allObjects.length,
        objects: objects.map((obj) => ({
          name: obj.name,
          size: obj.size,
          etag: obj.etag,
          lastModified: obj.lastModified?.toISOString(),
          isDir: obj.prefix !== undefined,
        })),
      };
    },
  });
}
