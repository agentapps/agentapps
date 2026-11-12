import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';

import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitWriteFileTool(app: AgentApp) {
  app.tool('git-write-file', {
    annotations: { readOnlyHint: false },
    description:
      'Write file content into the working tree (creates parent dirs) and stage it. Use `stage: false` to skip staging.',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'File path relative to repo root.' },
        content: {
          type: 'string',
          description: 'File content (utf8 by default, or base64 — see `encoding`).',
        },
        encoding: {
          type: 'string',
          enum: ['utf8', 'base64'],
          default: 'utf8',
        },
        stage: {
          type: 'boolean',
          description: 'Stage the change (`git add`).',
          default: true,
        },
      },
      required: ['path', 'content'],
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        path: string;
        content: string;
        encoding?: 'utf8' | 'base64';
        stage?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const absPath = resolve(repoPath, a.path);
      const repoNorm = resolve(repoPath);
      if (!absPath.startsWith(`${repoNorm}/`) && absPath !== repoNorm) {
        throw new Error(`[GIT_INVALID_PATH] Resolved path escapes the repo: ${absPath}`);
      }

      const encoding = a.encoding ?? 'utf8';
      mkdirSync(dirname(absPath), { recursive: true });
      if (encoding === 'base64') {
        writeFileSync(absPath, Buffer.from(a.content, 'base64'));
      } else {
        writeFileSync(absPath, a.content, 'utf-8');
      }

      let staged = false;
      if (a.stage !== false) {
        const result = runGit(repoPath, ['add', '--', a.path]);
        if (result.code !== 0) throwClassifiedGitError(result);
        staged = true;
      }

      return {
        repoPath,
        path: a.path,
        bytes:
          encoding === 'base64'
            ? Buffer.from(a.content, 'base64').length
            : Buffer.byteLength(a.content, 'utf-8'),
        staged,
      };
    },
  });
}
