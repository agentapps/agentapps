import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { buildInlineDiff, tryApplyPatch } from '../lib/diff.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { markRead } from '../lib/session.js';

export function registerPatchTool(app: AgentApp): void {
  app.tool('patch', {
    description:
      'Apply a unified diff (patch format) to a file. Uses fuzzy matching (fuzzFactor 2). For single-point changes prefer `edit`.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Target file to patch' },
        unifiedDiff: {
          type: 'string',
          description: 'Unified diff content (standard diff -u format)',
        },
        fuzzFactor: { type: 'number', description: 'Whitespace tolerance (default 2)' },
        dryRun: { type: 'boolean', description: 'Preview without writing (default false)' },
      },
      required: ['filePath', 'unifiedDiff'],
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
      const unifiedDiff = args.unifiedDiff;
      const fuzzFactor = typeof args.fuzzFactor === 'number' ? Math.max(0, args.fuzzFactor) : 2;
      const dryRun = Boolean(args.dryRun);

      if (typeof unifiedDiff !== 'string' || unifiedDiff.length === 0)
        throw new Error('unifiedDiff must be a non-empty string');

      const guard = getDefaultGuard();
      const canonical = guard.resolve(filePath, { forWrite: false });
      const before = readFileSync(canonical, 'utf-8');
      const result = tryApplyPatch(before, unifiedDiff, fuzzFactor);

      if (!result.success || result.content === undefined) {
        return {
          file: canonical,
          name: basename(canonical),
          applied: false,
          hunksApplied: result.hunksApplied,
          hunksFailed: result.hunksFailed,
          error: result.error ?? 'Patch could not be applied',
        };
      }

      if (!dryRun) {
        writeFileSync(canonical, result.content, 'utf-8');
        markRead(canonical);
      }

      return {
        file: canonical,
        name: basename(canonical),
        applied: true,
        dryRun,
        hunksApplied: result.hunksApplied,
        hunksFailed: 0,
        bytesBefore: Buffer.byteLength(before, 'utf-8'),
        bytesAfter: Buffer.byteLength(result.content, 'utf-8'),
        diff: buildInlineDiff(basename(canonical), before, result.content, 3),
      };
    },
  });
}
