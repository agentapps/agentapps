import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';

import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitReadFileTool(app: AgentApp) {
  app.tool('git-read-file', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description:
      'Read a file from the working tree or from a specific git revision. Pass `ref` (commit/branch/tag) to read the version at that point.',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'File path relative to repo root.' },
        ref: {
          type: 'string',
          description:
            'Optional commit/branch/tag. If omitted, reads from the current working tree.',
        },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          default: 'utf8',
          description: 'Output encoding. Use `base64` for binary files.',
        },
      },
      required: ['path'],
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        path: string;
        ref?: string;
        encoding?: 'utf8' | 'base64';
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const encoding = a.encoding ?? 'utf8';

      if (a.ref) {
        const result = runGit(repoPath, ['show', `${a.ref}:${a.path}`]);
        if (result.code !== 0) throwClassifiedGitError(result);
        const content =
          encoding === 'base64'
            ? Buffer.from(result.stdout, 'utf-8').toString('base64')
            : result.stdout;
        return { repoPath, path: a.path, ref: a.ref, encoding, content, size: content.length };
      }

      const absPath = resolve(repoPath, a.path);
      const repoNorm = resolve(repoPath);
      if (!absPath.startsWith(`${repoNorm}/`) && absPath !== repoNorm) {
        throw new Error(`[GIT_INVALID_PATH] Resolved path escapes the repo: ${absPath}`);
      }
      if (!existsSync(absPath)) {
        throw new Error(`[GIT_REF_NOT_FOUND] File not found in working tree: ${a.path}`);
      }
      const buf = readFileSync(absPath);
      const content = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf-8');
      return {
        repoPath,
        path: a.path,
        ref: 'working-tree',
        encoding,
        content,
        size: buf.byteLength,
      };
    },
  });
}
