import type { AgentApp } from '@agentapps/sdk';
import { assertIsRepo, positional, resolveRepoPath, runGit } from '../lib/git-local.js';
import { resolveUserToken } from '../lib/github-user-token.js';
import { throwClassifiedGitError } from './_git-error.js';

export function registerGitFetchTool(app: AgentApp) {
  app.tool('git-fetch', {
    annotations: {
      readOnlyHint: false,
      // Updates remote-tracking refs in the user's repository, not the working tree.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Fetch refs from the remote without merging. Use `refspec` to fetch arbitrary refs (e.g. `pull/<n>/head:pr-<n>` for a PR head, `refs/tags/v1.0.0:refs/tags/v1.0.0` for a tag).',
    parameters: {
      type: 'object',
      properties: {
        repoPath: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        remote: { type: 'string', default: 'origin' },
        refspec: {
          type: 'string',
          description:
            'Optional refspec — e.g. `pull/<n>/head:pr-<n>` to bring a PR head as a local branch, or `refs/tags/<tag>` to fetch a single tag. If omitted, fetches all branches and tags from the remote.',
        },
        depth: { type: 'number', description: 'Limit history to N commits (shallow fetch).' },
        tags: {
          type: 'boolean',
          description:
            'Also fetch tags (default true for default fetch, false when a refspec is provided).',
        },
        prune: {
          type: 'boolean',
          description: 'Remove local refs whose remote counterpart is gone (`--prune`).',
          default: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const a = args as {
        repoPath?: string;
        owner?: string;
        repo?: string;
        remote?: string;
        refspec?: string;
        depth?: number;
        tags?: boolean;
        prune?: boolean;
      };
      const repoPath = resolveRepoPath(a);
      assertIsRepo(repoPath);

      const remote = a.remote ?? 'origin';

      const token = await resolveUserToken(ctx);
      const authHeader = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      const cfgFlags = ['-c', `http.extraheader=${authHeader}`];

      const flags: string[] = [];
      if (typeof a.depth === 'number' && a.depth > 0) flags.push('--depth', String(a.depth));
      if (a.prune) flags.push('--prune');
      if (a.tags === true) flags.push('--tags');
      if (a.tags === false) flags.push('--no-tags');

      const argv = ['fetch', ...flags, positional(remote, 'remote')];
      if (a.refspec) argv.push(positional(a.refspec, 'refspec'));

      const result = runGit(repoPath, [...cfgFlags, ...argv]);
      if (result.code !== 0) throwClassifiedGitError(result);

      return {
        repoPath,
        remote,
        refspec: a.refspec,
        details: result.stdout.trim() || result.stderr.trim(),
      };
    },
  });
}
