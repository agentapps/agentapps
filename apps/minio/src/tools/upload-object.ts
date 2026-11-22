import * as fs from 'node:fs';
import * as os from 'node:os';
import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * upload-object — upload a file or string content to a bucket.
 */
export function registerUploadObjectTool(app: AgentApp): void {
  app.tool('upload-object', {
    description:
      'Upload a file or content to a MinIO bucket. Returns { success, bucket, objectName, size }. Params: bucket (required), objectName (required), filePath? (local file — use this OR content), content? (string — use this OR filePath), contentType? (MIME type, auto-detected if possible).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket.',
        },
        objectName: {
          type: 'string',
          description: 'Name/path for the object in the bucket.',
        },
        filePath: {
          type: 'string',
          description: 'Local file path to upload (use this OR content).',
        },
        content: {
          type: 'string',
          description: 'String content to upload (use this OR filePath).',
        },
        contentType: {
          type: 'string',
          description: 'MIME type (optional, auto-detected if possible).',
        },
      },
      required: ['bucket', 'objectName'],
    },
    annotations: {
      readOnlyHint: false,
      // Overwrites an object already stored under the same name.
      destructiveHint: true,
      idempotentHint: false,
      // The MinIO server is reached over the network, and filePath reads the local disk.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);
      const objectName = String(a.objectName);

      let size: number;
      const metaData: Record<string, string> = {};

      if (typeof a.contentType === 'string') {
        metaData['Content-Type'] = a.contentType;
      }

      const client = await getMinioClient(ctx);

      if (typeof a.filePath === 'string') {
        const filePath = a.filePath.startsWith('~')
          ? a.filePath.replace('~', os.homedir())
          : a.filePath;

        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${filePath}`);
        }

        const stats = fs.statSync(filePath);
        size = stats.size;

        await client.fPutObject(bucket, objectName, filePath, metaData);
      } else if (typeof a.content === 'string') {
        const buffer = Buffer.from(a.content, 'utf-8');
        size = buffer.length;

        await client.putObject(bucket, objectName, buffer, size, metaData);
      } else {
        throw new Error("Either 'filePath' or 'content' must be provided.");
      }

      return {
        success: true,
        bucket,
        objectName,
        size,
      };
    },
  });
}
