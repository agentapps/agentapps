import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';

import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitMvTool(app: AgentApp) {
  app.tool('git-mv', {
    annotations: {
      readOnlyHint: false,
      // `force` overwrites the destination file, whose content may not be committed.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Move or rename a tracked file/directory while preserving git history. Both `from` and `to` are relative to repo root.',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        from: { type: 'string', description: 'Source path (relative to repo root).' },
        to: { type: 'string', description: 'Destination path (relative to repo root).' },
        force: {
          type: 'boolean',
          description: 'Overwrite `to` if it already exists (`-f`).',
          default: false,
        },
      },
      required: ['from', 'to'],
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        from: string;
        to: string;
        force?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      if (!a.from || !a.to) {
        throw new Error('[GIT_INVALID_INPUT] Both `from` and `to` are required.');
      }

      const absTo = resolve(repoPath, a.to);
      mkdirSync(dirname(absTo), { recursive: true });

      const flags = a.force ? ['-f'] : [];
      const result = runGit(repoPath, ['mv', ...flags, a.from, a.to]);
      if (result.code !== 0) throwClassifiedGitError(result);

      return {
        repoPath,
        from: a.from,
        to: a.to,
        details: result.stdout.trim(),
      };
    },
  });
}
