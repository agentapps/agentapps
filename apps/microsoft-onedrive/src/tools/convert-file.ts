import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { assertSize, createGraphClient, requireItemRef } from '../lib/index.js';

/** convert-file — GET {itemRef}/content?format=pdf. */
export function registerConvertFileTool(app: AgentApp): void {
  app.tool('convert-file', {
    description:
      'Convert a OneDrive document (Word, Excel, PowerPoint, and other supported types) to PDF and save it locally. Files above 50 MB are refused.',
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
      // Writes the PDF to the user's disk and overwrites a file of the same name there.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const outputPath = (a.outputPath as string) || '/workspace/onedrive-downloads';
      const base = requireItemRef(a);

      // Metadata first, then the guards, then the content fetch — the same
      // ordering download-file uses, so a folder or an oversized document is
      // refused before any bytes are transferred. `folder` must stay in the
      // $select: it is a real field projection, and without it Graph omits the
      // facet even for a folder and the guard below never fires.
      const meta = await graphRequest<Record<string, any>>(
        'GET',
        `${base}?$select=id,name,size,file,folder`,
      );
      if (meta.folder) {
        throw new Error(`"${meta.name}" is a folder. convert-file only handles files.`);
      }
      assertSize(meta.size ?? 0, `"${meta.name}"`);

      const buffer: Buffer = await graphRequest<Buffer>(
        'GET',
        `${base}/content?format=pdf`,
        undefined,
        { responseType: 'buffer' },
      );

      const pdfName = `${meta.name.replace(/\.[^.]+$/, '')}.pdf`;
      mkdirSync(outputPath, { recursive: true });
      const filePath = join(outputPath, pdfName);
      writeFileSync(filePath, buffer);

      return {
        success: true,
        account: email,
        source: meta.name,
        name: pdfName,
        savedTo: filePath,
        size: buffer.length,
      };
    },
  });
}
