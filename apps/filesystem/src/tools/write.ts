import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { humanizeBytes } from '../lib/formatters.js';
import { LIMITS } from '../lib/limits.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { hasRead, markRead } from '../lib/session.js';

export function registerWriteTool(app: AgentApp): void {
  app.tool('write', {
    description:
      'Write content to a file, overwriting if it exists. Safety: an existing file must have been read first in this session. For new files, parent directories are created automatically. Use `edit` for in-place modifications.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or workspace-relative path' },
        content: { type: 'string', description: 'Content to write (UTF-8)' },
      },
      required: ['filePath', 'content'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const filePath = args.filePath as string;
      const content = args.content;
      if (typeof content !== 'string') throw new Error('content must be a string');
      if (Buffer.byteLength(content, 'utf-8') > LIMITS.MAX_WRITE_BYTES) {
        throw new Error(
          `Content too large: ${humanizeBytes(Buffer.byteLength(content, 'utf-8'))} (max ${humanizeBytes(LIMITS.MAX_WRITE_BYTES)})`,
        );
      }

      const guard = getDefaultGuard();
      const canonical = guard.resolve(filePath, { forWrite: true });

      const fileExists = existsSync(canonical);
      if (fileExists && !hasRead(canonical)) {
        throw new Error(
          `Refusing to overwrite existing file without reading it first: ${canonical}. Call 'read' before 'write', or use 'edit'.`,
        );
      }

      const parent = dirname(canonical);
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

      let previousSize = 0;
      if (fileExists) {
        try {
          previousSize = statSync(canonical).size;
        } catch {
          previousSize = 0;
        }
      }

      writeFileSync(canonical, content, 'utf-8');
      markRead(canonical);

      const newSize = statSync(canonical).size;
      const previewBytes = 64 * 1024;
      const isPreviewTruncated = Buffer.byteLength(content, 'utf-8') > previewBytes;
      const preview = isPreviewTruncated
        ? content.slice(0, content.length / 2).slice(0, previewBytes)
        : content;

      return {
        file: canonical,
        name: basename(canonical),
        created: !fileExists,
        size: newSize,
        sizeHuman: humanizeBytes(newSize),
        previousSize: fileExists ? previousSize : null,
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
        lineCount: content.split('\n').length,
        preview,
        previewTruncated: isPreviewTruncated,
      };
    },
  });
}
