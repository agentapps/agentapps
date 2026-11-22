import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerMoveTool(app: AgentApp): void {
  app.tool('move', {
    description:
      'Move or rename a file or directory. Fails if destination exists unless overwrite: true.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
        overwrite: { type: 'boolean' },
      },
      required: ['source', 'destination'],
    },
    // Works on the user's own files (the workspace roots). Destructive because overwrite: true
    // replaces whatever was at the destination. Not idempotent: a repeat fails, the source is gone.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const source = args.source as string;
      const destination = args.destination as string;
      const overwrite = Boolean(args.overwrite);

      const guard = getDefaultGuard();
      const srcCanonical = guard.resolve(source);
      const dstCanonical = guard.resolve(destination, { forWrite: true });

      const srcStat = statSync(srcCanonical);
      const type = srcStat.isDirectory() ? 'directory' : 'file';

      const dstExisted = existsSync(dstCanonical);
      if (dstExisted && !overwrite)
        throw new Error(`destination exists; set overwrite: true: ${dstCanonical}`);

      const dstParent = dirname(dstCanonical);
      if (!existsSync(dstParent)) mkdirSync(dstParent, { recursive: true });

      renameSync(srcCanonical, dstCanonical);

      return {
        source: srcCanonical,
        destination: dstCanonical,
        sourceName: basename(srcCanonical),
        destinationName: basename(dstCanonical),
        type,
        overwritten: dstExisted,
      };
    },
  });
}
