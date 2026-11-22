import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitResetTool(app: AgentApp) {
  app.tool('git-reset', {
    description:
      'Reset HEAD to `target`. `mode: soft` keeps staging; `mode: mixed` (default) keeps working tree; `mode: hard` discards everything (destructive).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        target: {
          type: 'string',
          description: 'Ref to reset to (default `HEAD`).',
          default: 'HEAD',
        },
        mode: { type: 'string', enum: ['soft', 'mixed', 'hard'], default: 'mixed' },
      },
    },
    handler: async (args, _ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        target?: string;
        mode?: 'soft' | 'mixed' | 'hard';
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const target = a.target ?? 'HEAD';
      const mode = a.mode ?? 'mixed';

      const result = runGit(repoPath, ['reset', `--${mode}`, target]);
      if (result.code !== 0) throwClassifiedGitError(result);

      const headResult = runGit(repoPath, ['rev-parse', 'HEAD']);
      const branchResult = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

      return {
        repoPath,
        mode,
        target,
        head: headResult.stdout.trim(),
        branch: branchResult.stdout.trim(),
        details: result.stdout.trim() || result.stderr.trim(),
      };
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      // Runs the git CLI on the user's files.
      openWorldHint: true,
      sensitive: true,
    },
  });
}
