import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { detectFileKind, humanizeBytes } from '../lib/formatters.js';
import { buildIgnoreFilter } from '../lib/ignore.js';
import { LIMITS } from '../lib/limits.js';
import { decodeCursor, paginate } from '../lib/pagination.js';
import { getDefaultGuard } from '../lib/path-safety.js';

interface ListItem {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  sizeHuman: string;
  mtime: string;
  kind?: string;
  depth: number;
}

export function registerListTool(app: AgentApp): void {
  app.tool('list', {
    description:
      'List directory entries with metadata (name, type, size, mtime, kind). Optionally recursive via depth. Honors ignore patterns and respectGitignore. Paginates with limit + cursor.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to list (default: workspace root)' },
        depth: {
          type: 'number',
          description: 'Max recursion depth (0 = current dir only, default 0, max 20)',
        },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra ignore patterns (gitignore syntax)',
        },
        respectGitignore: {
          type: 'boolean',
          description: 'If true, load .gitignore from the root',
        },
        limit: { type: 'number', description: 'Max entries to return (default 50, max 200)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args) => {
      const guard = getDefaultGuard();
      const rawPath = (args.path as string | undefined) ?? guard.roots[0] ?? process.cwd();
      const canonical = guard.resolve(rawPath);

      const stat = statSync(canonical);
      if (!stat.isDirectory()) throw new Error(`Path is not a directory: ${rawPath}`);

      const depth = Math.min(
        typeof args.depth === 'number' ? Math.max(0, args.depth) : 0,
        LIMITS.MAX_TREE_DEPTH,
      );
      const limit = Math.min(
        typeof args.limit === 'number' ? Math.max(1, args.limit) : LIMITS.DEFAULT_LIST_LIMIT,
        LIMITS.MAX_LIST_LIMIT,
      );
      const offset = decodeCursor(args.cursor as string | undefined);
      const userIgnore = Array.isArray(args.ignore) ? (args.ignore as string[]) : undefined;
      const respectGitignore = Boolean(args.respectGitignore);

      const filter = buildIgnoreFilter({
        root: canonical,
        userPatterns: userIgnore,
        respectGitignore,
      });

      const all: ListItem[] = [];
      function walk(dir: string, currentDepth: number) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const rel = relative(canonical, fullPath);
          if (filter.ignores(rel)) continue;
          try {
            const st = statSync(fullPath);
            const type: ListItem['type'] = entry.isDirectory()
              ? 'directory'
              : entry.isSymbolicLink()
                ? 'symlink'
                : entry.isFile()
                  ? 'file'
                  : 'other';
            const item: ListItem = {
              name: entry.name,
              path: fullPath,
              type,
              size: st.size,
              sizeHuman: humanizeBytes(st.size),
              mtime: st.mtime.toISOString(),
              depth: currentDepth,
            };
            if (type === 'file') item.kind = detectFileKind(entry.name);
            all.push(item);
            if (type === 'directory' && currentDepth < depth) walk(fullPath, currentDepth + 1);
          } catch {
            /* unreadable entries skipped */
          }
        }
      }
      walk(canonical, 0);

      all.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const { page, nextCursor } = paginate(all, offset, limit);

      return {
        path: canonical,
        depth,
        respectGitignore,
        totalEntries: all.length,
        returned: page.length,
        offset,
        entries: page,
        ...(nextCursor ? { nextCursor } : {}),
      };
    },
  });
}
