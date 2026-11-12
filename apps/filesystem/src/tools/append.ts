import { appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { humanizeBytes } from '../lib/formatters.js';
import { LIMITS } from '../lib/limits.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { markRead } from '../lib/session.js';

export function registerAppendTool(app: AgentApp): void {
  app.tool('append', {
    description:
      'Append content to the end of a file. Creates the file (and parents) if it does not exist. Does NOT require a prior read.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or workspace-relative path' },
        content: { type: 'string', description: 'Content to append (UTF-8)' },
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
      const fileExisted = existsSync(canonical);
      const parent = dirname(canonical);
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

      appendFileSync(canonical, content, 'utf-8');
      markRead(canonical);

      const newSize = statSync(canonical).size;
      const previewBytes = 32 * 1024;
      const isPreviewTruncated = Buffer.byteLength(content, 'utf-8') > previewBytes;

      return {
        file: canonical,
        name: basename(canonical),
        created: !fileExisted,
        bytesAppended: Buffer.byteLength(content, 'utf-8'),
        totalSize: newSize,
        totalSizeHuman: humanizeBytes(newSize),
        appendedPreview: isPreviewTruncated ? content.slice(0, previewBytes) : content,
        appendedPreviewTruncated: isPreviewTruncated,
      };
    },
  });
}
