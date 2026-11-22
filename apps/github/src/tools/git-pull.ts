import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, resolveRepoPath, runGit } from '../lib/git-local.js';
import { resolveUserToken } from '../lib/github-user-token.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitPullTool(app: AgentApp) {
  app.tool('git-pull', {
    annotations: {
      readOnlyHint: false,
      // Git refuses to pull over uncommitted changes; local commits are kept.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Pull commits from the remote into the current branch. `rebase: true` for a linear history (no merge commit).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        remote: { type: 'string', default: 'origin' },
        branch: { type: 'string', description: 'Remote branch to pull. Defaults to upstream.' },
        rebase: {
          type: 'boolean',
          description: 'Use `--rebase` instead of merge.',
          default: false,
        },
        ff: {
          type: 'string',
          enum: ['only', 'no', 'auto'],
          default: 'auto',
          description:
            '`only` = abort if not fast-forward; `no` = always merge commit; `auto` = git default.',
        },
      },
    },
    handler: async (args, ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        remote?: string;
        branch?: string;
        rebase?: boolean;
        ff?: 'only' | 'no' | 'auto';
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const token = await resolveUserToken(ctx);
      const authHeader = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      const cfgFlags = ['-c', `http.extraheader=${authHeader}`];

      const flags: string[] = [];
      if (a.rebase) flags.push('--rebase');
      if (a.ff === 'only') flags.push('--ff-only');
      if (a.ff === 'no') flags.push('--no-ff');

      const argv = ['pull', ...flags];
      if (a.remote) argv.push(a.remote);
      if (a.branch) argv.push(a.branch);

      const result = runGit(repoPath, [...cfgFlags, ...argv]);
      if (result.code !== 0) throwClassifiedGitError(result);

      const branchResult = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const shaResult = runGit(repoPath, ['rev-parse', 'HEAD']);

      return {
        repoPath,
        remote: a.remote ?? 'origin',
        branch: branchResult.stdout.trim(),
        head: shaResult.stdout.trim(),
        rebase: a.rebase === true,
        details: result.stdout.trim() || result.stderr.trim(),
      };
    },
  });
}
