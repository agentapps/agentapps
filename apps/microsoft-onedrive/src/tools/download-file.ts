import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { assertSize, createGraphClient, requireItemRef } from '../lib/index.js';

/** download-file — GET {itemRef}/content, saved to the local filesystem. */
export function registerDownloadFileTool(app: AgentApp): void {
  app.tool('download-file', {
    description:
      'Download a OneDrive file and save it to the local filesystem. Files above 50 MB are refused.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'File path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
        outputPath: {
          type: 'string',
          description: 'Output directory (default: /workspace/onedrive-downloads)',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const outputPath = (a.outputPath as string) || '/workspace/onedrive-downloads';
      const base = requireItemRef(a);

      const meta = await graphRequest<Record<string, any>>(
        'GET',
        `${base}?$select=id,name,size,file,folder`,
      );
      if (meta.folder) {
        throw new Error(`"${meta.name}" is a folder. download-file only handles files.`);
      }
      assertSize(meta.size ?? 0, `"${meta.name}"`);

      const buffer: Buffer = await graphRequest<Buffer>('GET', `${base}/content`, undefined, {
        responseType: 'buffer',
      });

      mkdirSync(outputPath, { recursive: true });
      const filePath = join(outputPath, meta.name);
      writeFileSync(filePath, buffer);

      return { success: true, account: email, name: meta.name, savedTo: filePath, size: meta.size };
    },
  });
}
