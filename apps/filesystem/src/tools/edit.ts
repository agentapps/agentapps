import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { buildInlineDiff } from '../lib/diff.js';
import { LIMITS } from '../lib/limits.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { markRead } from '../lib/session.js';

export function registerEditTool(app: AgentApp): void {
  app.tool('edit', {
    description:
      'Replace exact string occurrence(s) in a file. Fails if oldString appears zero or multiple times — pass replaceAll: true for every match. Returns a unified diff.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        oldString: {
          type: 'string',
          description: 'Exact substring to match (whitespace-sensitive)',
        },
        newString: { type: 'string', description: 'Replacement text' },
        replaceAll: { type: 'boolean', description: 'Replace every occurrence (default false)' },
        dryRun: {
          type: 'boolean',
          description: 'Preview the change without writing (default false)',
        },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
    // Rewrites one of the user's own files in place; the previous content is not kept.
    // Annotated for the real write, although dryRun: true changes nothing.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args) => {
      const filePath = args.filePath as string;
      const oldString = args.oldString as string;
      const newString = args.newString as string;
      const replaceAll = Boolean(args.replaceAll);
      const dryRun = Boolean(args.dryRun);

      if (typeof oldString !== 'string' || oldString.length === 0)
        throw new Error('oldString must be a non-empty string');
      if (typeof newString !== 'string') throw new Error('newString must be a string');
      if (Buffer.byteLength(oldString, 'utf-8') > LIMITS.MAX_EDIT_OLDSTRING_BYTES) {
        throw new Error(
          `oldString too large (>${LIMITS.MAX_EDIT_OLDSTRING_BYTES} bytes). Rewrite with 'write' instead.`,
        );
      }

      const guard = getDefaultGuard();
      const canonical = guard.resolve(filePath, { forWrite: false });

      const before = readFileSync(canonical, 'utf-8');
      const occurrences = before.split(oldString).length - 1;

      if (occurrences === 0)
        throw new Error(
          `oldString not found in ${canonical}. Check whitespace, indentation, and quoting.`,
        );
      if (!replaceAll && occurrences > 1) {
        throw new Error(
          `oldString appears ${occurrences} times; pass replaceAll: true or include more context to make it unique.`,
        );
      }

      const after = replaceAll
        ? before.split(oldString).join(newString)
        : before.replace(oldString, newString);
      const replacements = replaceAll ? occurrences : 1;

      if (!dryRun) {
        writeFileSync(canonical, after, 'utf-8');
        markRead(canonical);
      }

      return {
        file: canonical,
        name: basename(canonical),
        replacements,
        replaceAll,
        dryRun,
        bytesBefore: Buffer.byteLength(before, 'utf-8'),
        bytesAfter: Buffer.byteLength(after, 'utf-8'),
        diff: buildInlineDiff(basename(canonical), before, after, 3),
      };
    },
  });
}
