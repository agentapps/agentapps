import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { detectMimeType } from '../lib/mime.js';
import { getDefaultGuard } from '../lib/path-safety.js';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export function registerReadMediaTool(app: AgentApp): void {
  app.tool('read_media', {
    description:
      'Read a binary file and return base64 + detected MIME type. Hard cap 10 MB. For text files use read.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or workspace-relative path' },
      },
      required: ['filePath'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args) => {
      const filePath = args.filePath as string;
      if (!filePath) throw new Error('filePath must be a non-empty string');

      const guard = getDefaultGuard();
      const canonical = guard.resolve(filePath);
      const stat = statSync(canonical);

      if (!stat.isFile()) throw new Error(`Not a regular file: ${canonical}`);
      if (stat.size > MAX_MEDIA_BYTES)
        throw new Error(
          `File too large for read_media (${stat.size} bytes > ${MAX_MEDIA_BYTES} cap).`,
        );

      const mimeType = (await detectMimeType(canonical)) ?? 'application/octet-stream';
      const buffer = readFileSync(canonical);

      return {
        file: canonical,
        name: basename(canonical),
        size: stat.size,
        mimeType,
        base64: buffer.toString('base64'),
        mtime: stat.mtime.toISOString(),
      };
    },
  });
}
