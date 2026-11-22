import { existsSync, lstatSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { detectFileKind, humanizeBytes } from '../lib/formatters.js';
import { detectMimeType } from '../lib/mime.js';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerStatTool(app: AgentApp): void {
  app.tool('stat', {
    description:
      'Return metadata for a single path: exists, type, size, mtime, permissions. Does NOT read content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or workspace-relative path' },
      },
      required: ['path'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const rawPath = args.path as string;
      const guard = getDefaultGuard();

      let canonical: string;
      try {
        canonical = guard.resolveNoFollow(rawPath);
      } catch (err) {
        if (err instanceof Error && /outside allowed roots/.test(err.message)) throw err;
        return { path: rawPath, exists: false };
      }

      if (!existsSync(canonical)) {
        return { path: canonical, name: basename(canonical), exists: false };
      }

      const st = lstatSync(canonical);
      const type = st.isDirectory()
        ? 'directory'
        : st.isSymbolicLink()
          ? 'symlink'
          : st.isFile()
            ? 'file'
            : 'other';
      const mimeType = type === 'file' ? await detectMimeType(canonical) : null;

      return {
        path: canonical,
        name: basename(canonical),
        exists: true,
        type,
        size: st.size,
        sizeHuman: humanizeBytes(st.size),
        mtime: st.mtime.toISOString(),
        ctime: st.ctime.toISOString(),
        birthtime: st.birthtime.toISOString(),
        permissions: (st.mode & 0o777).toString(8).padStart(3, '0'),
        ...(type === 'file' ? { kind: detectFileKind(canonical), mimeType } : {}),
      };
    },
  });
}
