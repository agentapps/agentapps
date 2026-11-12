import { existsSync, rmSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerDeleteTool(app: AgentApp): void {
  app.tool('delete', {
    description:
      'Delete a file or directory. Set recursive: true for non-empty directories. Idempotent: succeeds if path does not exist.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', description: 'Required for non-empty directories' },
      },
      required: ['path'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args) => {
      const rawPath = args.path as string;
      const recursive = Boolean(args.recursive);

      const guard = getDefaultGuard();
      const canonical = guard.resolveNoFollow(rawPath);

      if (!existsSync(canonical)) {
        return { path: canonical, name: basename(canonical), existed: false, deleted: false };
      }

      const st = statSync(canonical);
      const type = st.isDirectory() ? 'directory' : 'file';
      if (type === 'directory' && !recursive) {
        rmSync(canonical, { recursive: false });
      } else {
        rmSync(canonical, { recursive, force: true });
      }

      return { path: canonical, name: basename(canonical), existed: true, deleted: true, type };
    },
  });
}
