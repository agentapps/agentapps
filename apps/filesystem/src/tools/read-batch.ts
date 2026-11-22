import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { detectFileKind, formatCatN, humanizeBytes } from '../lib/formatters.js';
import { LIMITS } from '../lib/limits.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { markRead } from '../lib/session.js';

interface BatchFileResult {
  file: string;
  name: string;
  ok: boolean;
  size?: number;
  sizeHuman?: string;
  kind?: string;
  totalLines?: number;
  content?: string;
  error?: string;
}

export function registerReadBatchTool(app: AgentApp): void {
  app.tool('read-batch', {
    description:
      'Read multiple text files in a single call. Individual failures do not abort the batch.',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute or workspace-relative paths (max 50)',
        },
        perFileLimit: {
          type: 'number',
          description: 'Max lines per file (default 2000, max 10000)',
        },
      },
      required: ['paths'],
    },
    // Read-only: the "read in this session" mark it leaves lives in the app's memory.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const rawPaths = args.paths;
      if (!Array.isArray(rawPaths) || rawPaths.length === 0)
        throw new Error('paths must be a non-empty array');
      if (rawPaths.length > LIMITS.MAX_BATCH_PATHS)
        throw new Error(`Too many paths (${rawPaths.length}); max is ${LIMITS.MAX_BATCH_PATHS}`);

      const perFileLimit =
        typeof args.perFileLimit === 'number'
          ? Math.min(Math.max(1, args.perFileLimit), LIMITS.MAX_FILE_READ_LINES)
          : LIMITS.DEFAULT_READ_LIMIT;

      const guard = getDefaultGuard();
      const files: BatchFileResult[] = [];
      let okCount = 0,
        failedCount = 0;

      for (const raw of rawPaths) {
        if (typeof raw !== 'string' || !raw) {
          files.push({ file: String(raw), name: '', ok: false, error: 'path must be a string' });
          failedCount++;
          continue;
        }
        try {
          const canonical = guard.resolve(raw);
          const stat = statSync(canonical);
          if (stat.isDirectory()) {
            files.push({
              file: canonical,
              name: basename(canonical),
              ok: false,
              error: 'path is a directory',
            });
            failedCount++;
            continue;
          }
          if (stat.size > LIMITS.MAX_FILE_READ_BYTES) {
            files.push({
              file: canonical,
              name: basename(canonical),
              ok: false,
              error: `file too large: ${humanizeBytes(stat.size)}`,
            });
            failedCount++;
            continue;
          }
          const kind = detectFileKind(canonical);
          if (kind === 'binary' || kind === 'image') {
            files.push({
              file: canonical,
              name: basename(canonical),
              ok: false,
              error: `cannot read ${kind} as text`,
            });
            failedCount++;
            continue;
          }
          const content = readFileSync(canonical, 'utf-8');
          const lines = content.split('\n');
          const selected = lines.slice(0, perFileLimit);
          markRead(canonical);
          files.push({
            file: canonical,
            name: basename(canonical),
            ok: true,
            size: stat.size,
            sizeHuman: humanizeBytes(stat.size),
            kind,
            totalLines: lines.length,
            content: formatCatN(selected.join('\n'), 1),
          });
          okCount++;
        } catch (err) {
          files.push({
            file: raw,
            name: basename(raw),
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
          failedCount++;
        }
      }

      return { requested: rawPaths.length, ok: okCount, failed: failedCount, files };
    },
  });
}
