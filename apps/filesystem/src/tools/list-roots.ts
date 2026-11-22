import { existsSync, statSync } from 'node:fs';
import type { AgentApp } from '@agentapps/sdk';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerListRootsTool(app: AgentApp): void {
  app.tool('list_roots', {
    description: 'List the workspace roots this app can access.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async () => {
      const guard = getDefaultGuard();
      const roots = guard.roots.map((root) => {
        const exists = existsSync(root);
        let type: string | null = null;
        if (exists) {
          try {
            const st = statSync(root);
            type = st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other';
          } catch {
            type = null;
          }
        }
        return { path: root, exists, type };
      });

      return { count: roots.length, roots };
    },
  });
}
