import { existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerMkdirTool(app: AgentApp): void {
  app.tool('mkdir', {
    description:
      'Create a directory. Creates parent directories as needed by default. Idempotent: returns created=false if already exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        recursive: { type: 'boolean', description: 'Create parents as needed (default true)' },
      },
      required: ['path'],
    },
    // Creates a directory among the user's own files (the workspace roots): sensitive, not
    // destructive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const rawPath = args.path as string;
      const recursive = args.recursive !== false;

      const guard = getDefaultGuard();
      const canonical = guard.resolve(rawPath, { forWrite: true });

      const existed = existsSync(canonical);
      if (!existed) mkdirSync(canonical, { recursive });

      return { path: canonical, name: basename(canonical), created: !existed, existed };
    },
  });
}
