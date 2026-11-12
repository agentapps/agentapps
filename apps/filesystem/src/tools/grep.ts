import type { AgentApp } from '@agentapps/sdk';
import { LIMITS } from '../lib/limits.js';
import { decodeCursor, paginate } from '../lib/pagination.js';
import { getDefaultGuard } from '../lib/path-safety.js';
import { runRipgrep } from '../lib/ripgrep.js';

export function registerGrepTool(app: AgentApp): void {
  app.tool('grep', {
    description:
      'Search file contents for a regex pattern using ripgrep. output_mode: "content" (matches with context), "files" (per-file counts), "count" (totals only).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern (Rust regex syntax)' },
        path: { type: 'string', description: 'Base directory or file (default: workspace root)' },
        output_mode: {
          type: 'string',
          enum: ['content', 'files', 'count'],
          description: 'Result shape (default "content")',
        },
        contextBefore: { type: 'number', description: 'Lines of context before each match' },
        contextAfter: { type: 'number', description: 'Lines of context after each match' },
        include: { type: 'string', description: 'Glob to filter files (e.g. "*.ts")' },
        type: { type: 'string', description: 'File type filter (e.g. js, py, rust, ts)' },
        caseInsensitive: { type: 'boolean' },
        multiline: { type: 'boolean', description: 'Allow pattern to match across newlines' },
        respectGitignore: { type: 'boolean' },
        limit: {
          type: 'number',
          description: 'Max matches or files to return (default 50, max 100)',
        },
        cursor: { type: 'string' },
      },
      required: ['pattern'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args) => {
      const pattern = args.pattern as string;
      if (!pattern) throw new Error('pattern must be a non-empty string');

      const guard = getDefaultGuard();
      const basePath = (args.path as string | undefined) ?? guard.roots[0] ?? process.cwd();
      const canonical = guard.resolve(basePath);

      const outputMode = (args.output_mode as string | undefined) ?? 'content';
      if (!['content', 'files', 'count'].includes(outputMode)) {
        throw new Error(`output_mode must be content|files|count, got "${outputMode}"`);
      }

      const limit = Math.min(
        typeof args.limit === 'number' ? Math.max(1, args.limit) : LIMITS.DEFAULT_LIST_LIMIT,
        LIMITS.MAX_MATCHES,
      );
      const offset = decodeCursor(args.cursor as string | undefined);

      const result = await runRipgrep({
        pattern,
        path: canonical,
        contextBefore: typeof args.contextBefore === 'number' ? Math.max(0, args.contextBefore) : 0,
        contextAfter: typeof args.contextAfter === 'number' ? Math.max(0, args.contextAfter) : 0,
        include: typeof args.include === 'string' ? args.include : undefined,
        type: typeof args.type === 'string' ? args.type : undefined,
        caseInsensitive: Boolean(args.caseInsensitive),
        multiline: Boolean(args.multiline),
        maxMatches: LIMITS.MAX_MATCHES,
        respectGitignore: Boolean(args.respectGitignore),
      });

      if (outputMode === 'count') {
        return {
          pattern,
          path: canonical,
          mode: 'count',
          totalMatches: result.totalMatches,
          totalFiles: result.totalFiles,
          truncated: result.truncated,
        };
      }

      if (outputMode === 'files') {
        const { page, nextCursor } = paginate(result.files, offset, limit);
        return {
          pattern,
          path: canonical,
          mode: 'files',
          totalFiles: result.totalFiles,
          totalMatches: result.totalMatches,
          truncated: result.truncated,
          returned: page.length,
          offset,
          files: page,
          ...(nextCursor ? { nextCursor } : {}),
        };
      }

      const { page, nextCursor } = paginate(result.matches, offset, limit);
      return {
        pattern,
        path: canonical,
        mode: 'content',
        totalMatches: result.totalMatches,
        totalFiles: result.totalFiles,
        truncated: result.truncated,
        returned: page.length,
        offset,
        matches: page,
        ...(nextCursor ? { nextCursor } : {}),
      };
    },
  });
}
