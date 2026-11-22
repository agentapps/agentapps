import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getMinioClient } from '../lib/minio-client.js';

/**
 * download-object — download an object from a bucket.
 */
export function registerDownloadObjectTool(app: AgentApp): void {
  app.tool('download-object', {
    description:
      'Download an object from a MinIO bucket to a local file. Returns { success, bucket, objectName, destPath, size }. Params: bucket (required), objectName (required), destPath? (default ~/Downloads/minio/).',
    parameters: {
      type: 'object',
      properties: {
        bucket: {
          type: 'string',
          description: 'Name of the bucket.',
        },
        objectName: {
          type: 'string',
          description: 'Name/path of the object to download.',
        },
        destPath: {
          type: 'string',
          description: 'Local destination path (optional, defaults to ~/Downloads/minio/).',
        },
      },
      required: ['bucket', 'objectName'],
    },
    annotations: {
      readOnlyHint: false,
      // Writes to any path on the machine and overwrites a file already there.
      destructiveHint: true,
      idempotentHint: true,
      // The MinIO server is reached over the network, and the file lands on the local disk.
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const bucket = String(a.bucket);
      const objectName = String(a.objectName);

      let destPath: string;
      if (typeof a.destPath === 'string' && a.destPath.length > 0) {
        destPath = a.destPath.startsWith('~') ? a.destPath.replace('~', os.homedir()) : a.destPath;
      } else {
        const downloadDir = path.join(os.homedir(), 'Downloads', 'minio');
        if (!fs.existsSync(downloadDir)) {
          fs.mkdirSync(downloadDir, { recursive: true });
        }
        destPath = path.join(downloadDir, path.basename(objectName));
      }

      // Ensure directory exists
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const client = await getMinioClient(ctx);
      await client.fGetObject(bucket, objectName, destPath);

      const stats = fs.statSync(destPath);

      return {
        success: true,
        bucket,
        objectName,
        destPath,
        size: stats.size,
      };
    },
  });
}
