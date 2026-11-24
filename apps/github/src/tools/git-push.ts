import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, positional, resolveRepoPath, runGit } from '../lib/git-local.js';
import { resolveUserToken } from '../lib/github-user-token.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitPushTool(app: AgentApp) {
  app.tool('git-push', {
    description:
      'Push commits to the remote. `force: true` uses `--force-with-lease`; `forceUnsafe: true` uses raw `--force` (destructive).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        remote: {
          type: 'string',
          description: 'Remote name. Defaults to `origin`.',
          default: 'origin',
        },
        branch: {
          type: 'string',
          description: 'Local branch to push. Defaults to current branch.',
        },
        setUpstream: {
          type: 'boolean',
          description: 'Set upstream tracking (`-u`).',
          default: true,
        },
        force: {
          type: 'boolean',
          description: 'Use `--force-with-lease` (safer force).',
          default: false,
        },
        forceUnsafe: {
          type: 'boolean',
          description: 'Use raw `--force` (destructive; rewrites remote history).',
          default: false,
        },
        tags: { type: 'boolean', description: 'Push tags along with commits.', default: false },
      },
    },
    handler: async (args, ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        remote?: string;
        branch?: string;
        setUpstream?: boolean;
        force?: boolean;
        forceUnsafe?: boolean;
        tags?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const remote = a.remote ?? 'origin';

      let branch = a.branch;
      if (!branch) {
        const r = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        if (r.code !== 0) throwClassifiedGitError(r);
        branch = r.stdout.trim();
        if (!branch || branch === 'HEAD') {
          throw new Error(
            '[GIT_DETACHED_HEAD] Cannot push from a detached HEAD. Check out a branch first.',
          );
        }
      }

      const token = await resolveUserToken(ctx);
      const authHeader = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      const cfgFlags = ['-c', `http.extraheader=${authHeader}`];

      const flags: string[] = [];
      if (a.setUpstream !== false) flags.push('-u');
      if (a.tags) flags.push('--tags');
      if (a.forceUnsafe) flags.push('--force');
      else if (a.force) flags.push('--force-with-lease');

      const result = runGit(repoPath, [
        ...cfgFlags,
        'push',
        ...flags,
        positional(remote, 'remote'),
        positional(branch, 'branch'),
      ]);
      if (result.code !== 0) throwClassifiedGitError(result);

      return {
        repoPath,
        remote,
        branch,
        forced: a.forceUnsafe ? 'unsafe' : a.force ? 'lease' : 'none',
        details: result.stderr.trim(),
      };
    },
    annotations: {
      sensitive: true,
      destructiveHint: true,
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  });
}
