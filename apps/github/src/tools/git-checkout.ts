import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitCheckoutTool(app: AgentApp) {
  app.tool('git-checkout', {
    description:
      'Switch branches, create a new branch, or restore specific paths. Returns the new HEAD ref. Set `force: true` to discard local changes (destructive).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        target: {
          type: 'string',
          description: 'Branch, tag, commit SHA, or — with `paths` — restore source.',
        },
        create: {
          type: 'boolean',
          description: 'Create a new branch named `target` (`-b`).',
          default: false,
        },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Restore these specific paths from `target` (no branch switch).',
        },
        force: {
          type: 'boolean',
          description: 'Discard local changes (`--force`). Destructive.',
          default: false,
        },
      },
      required: ['target'],
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        target: string;
        create?: boolean;
        paths?: string[];
        force?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      if (!a.target || a.target.trim().length === 0) {
        throw new Error('[GIT_INVALID_INPUT] `target` is required (branch, tag, or commit).');
      }

      const flags: string[] = [];
      if (a.force) flags.push('--force');
      if (a.create) flags.push('-b');

      const args2: string[] = ['checkout', ...flags, a.target];
      if (a.paths && a.paths.length > 0) {
        args2.push('--', ...a.paths);
      }

      const result = runGit(repoPath, args2);
      if (result.code !== 0) throwClassifiedGitError(result);

      const headResult = runGit(repoPath, ['rev-parse', 'HEAD']);
      const branchResult = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

      return {
        repoPath,
        target: a.target,
        created: a.create === true,
        head: headResult.stdout.trim(),
        branch: branchResult.stdout.trim(),
        details: result.stderr.trim(),
      };
    },
    annotations: {
      readOnlyHint: false,
      // `force` discards local changes and `paths` overwrites working files with no way back.
      destructiveHint: true,
      idempotentHint: false,
      // Runs the git CLI on the user's files.
      openWorldHint: true,
      sensitive: true,
    },
  });
}
