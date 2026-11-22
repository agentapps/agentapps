import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { humanizeBytes } from '../lib/formatters.js';
import { getDefaultGuard } from '../lib/path-safety.js';

export function registerCopyTool(app: AgentApp): void {
  app.tool('copy', {
    description:
      'Copy a file or directory. For directories set recursive: true. Fails if destination exists unless overwrite: true.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string' },
        destination: { type: 'string' },
        recursive: { type: 'boolean', description: 'Required to copy directories' },
        overwrite: { type: 'boolean', description: 'Overwrite destination if it exists' },
      },
      required: ['source', 'destination'],
    },
    // Works on the user's own files (the workspace roots). Destructive because overwrite: true
    // replaces whatever was at the destination.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const source = args.source as string;
      const destination = args.destination as string;
      const recursive = Boolean(args.recursive);
      const overwrite = Boolean(args.overwrite);

      const guard = getDefaultGuard();
      const srcCanonical = guard.resolve(source);
      const dstCanonical = guard.resolve(destination, { forWrite: true });

      const srcStat = statSync(srcCanonical);
      const srcType = srcStat.isDirectory() ? 'directory' : 'file';
      if (srcType === 'directory' && !recursive)
        throw new Error('source is a directory; set recursive: true');

      const dstExisted = existsSync(dstCanonical);
      if (dstExisted && !overwrite)
        throw new Error(`destination exists; set overwrite: true: ${dstCanonical}`);

      const dstParent = dirname(dstCanonical);
      if (!existsSync(dstParent)) mkdirSync(dstParent, { recursive: true });

      cpSync(srcCanonical, dstCanonical, { recursive, force: overwrite, errorOnExist: !overwrite });

      const dstStat = statSync(dstCanonical);
      return {
        source: srcCanonical,
        destination: dstCanonical,
        sourceName: basename(srcCanonical),
        destinationName: basename(dstCanonical),
        type: srcType,
        overwritten: dstExisted,
        size: dstStat.size,
        sizeHuman: humanizeBytes(dstStat.size),
      };
    },
  });
}
