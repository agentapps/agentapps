import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { buildIgnoreFilter } from '../lib/ignore.js';
import { LIMITS } from '../lib/limits.js';
import { getDefaultGuard } from '../lib/path-safety.js';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  mtime?: string;
  children?: TreeNode[];
}

export function registerTreeTool(app: AgentApp): void {
  app.tool('tree', {
    description:
      'Return a hierarchical JSON tree of a directory up to depth levels. Capped by maxNodes. Use list for flat pagination or glob for pattern match.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Root directory (default: workspace root)' },
        depth: { type: 'number', description: 'Max depth to descend (default 3, max 20)' },
        ignore: { type: 'array', items: { type: 'string' }, description: 'Extra ignore patterns' },
        respectGitignore: { type: 'boolean' },
        maxNodes: { type: 'number', description: 'Hard cap on total nodes (default 500)' },
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
        typeof args.depth === 'number' ? Math.max(0, args.depth) : 3,
        LIMITS.MAX_TREE_DEPTH,
      );
      const maxNodes = typeof args.maxNodes === 'number' ? Math.max(1, args.maxNodes) : 500;
      const filter = buildIgnoreFilter({
        root: canonical,
        userPatterns: Array.isArray(args.ignore) ? (args.ignore as string[]) : undefined,
        respectGitignore: Boolean(args.respectGitignore),
      });

      let nodeCount = 0;
      let truncated = false;

      function build(dir: string, currentDepth: number): TreeNode[] {
        if (currentDepth > depth) return [];
        const children: TreeNode[] = [];
        let entries: import('node:fs').Dirent[];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return [];
        }
        entries.sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        for (const entry of entries) {
          if (nodeCount >= maxNodes) {
            truncated = true;
            break;
          }
          const fullPath = join(dir, entry.name);
          const rel = relative(canonical, fullPath);
          if (filter.ignores(rel)) continue;
          try {
            const st = statSync(fullPath);
            if (entry.isDirectory()) {
              nodeCount++;
              children.push({
                name: entry.name,
                path: fullPath,
                type: 'directory',
                children: build(fullPath, currentDepth + 1),
              });
            } else if (entry.isFile()) {
              nodeCount++;
              children.push({
                name: entry.name,
                path: fullPath,
                type: 'file',
                size: st.size,
                mtime: st.mtime.toISOString(),
              });
            }
          } catch {
            /* skip unreadable */
          }
        }
        return children;
      }

      const root: TreeNode = {
        name: canonical.split('/').pop() || canonical,
        path: canonical,
        type: 'directory',
        children: build(canonical, 1),
      };

      return { root: canonical, depth, totalNodes: nodeCount, truncated, tree: root };
    },
  });
}
