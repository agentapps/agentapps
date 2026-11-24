import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import type { AgentApp } from '@agentapps/sdk';
import { resolveUserToken } from '../lib/github-user-token.js';

export function registerCloneRepoTool(app: AgentApp) {
  app.tool('clone-repo', {
    annotations: {
      readOnlyHint: false,
      // Writes a new directory on the user's machine; it refuses a path that exists.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Clone a GitHub repository to the local filesystem. Returns {path, branch, sha, recentCommits[]}.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        destination: { type: 'string', description: 'Local path (default: /workspace/<repo>)' },
        branch: { type: 'string', description: 'Branch to checkout after cloning' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, branch } = args as {
        owner: string;
        repo: string;
        destination?: string;
        branch?: string;
      };
      const destination = (args as { destination?: string }).destination || `/workspace/${repo}`;
      if (fs.existsSync(destination))
        throw new Error(`Destination path already exists: ${destination}`);
      // These go to git as separate arguments, never through a shell, and are checked first:
      // a value such as `x"; rm -rf ~; "` must not be able to run anything.
      if (
        !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner) ||
        !/^[A-Za-z0-9._-]+$/.test(repo)
      ) {
        throw new Error('owner and repo must be a GitHub owner and repository name');
      }
      if (branch !== undefined && (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('-'))) {
        throw new Error('branch is not a valid branch name');
      }
      const token = await resolveUserToken(ctx);
      // The token travels in a header for this one command, as in git-fetch, git-pull and
      // git-push. In the URL it would be saved in the clone's .git/config for good.
      const authHeader = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      const cloneArgs = [
        '-c',
        `http.extraheader=${authHeader}`,
        'clone',
        ...(branch ? ['--branch', branch] : []),
        '--',
        `https://github.com/${owner}/${repo}.git`,
        destination,
      ];
      const git = (args: string[], timeout?: number) =>
        execFileSync('git', args, {
          encoding: 'utf-8',
          timeout,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      try {
        const output = git(cloneArgs, 120_000);
        const logOutput = git(['-C', destination, 'log', '--oneline', '-5']).trim();
        const branchOutput = git(['-C', destination, 'branch', '--show-current']).trim();
        const shaOutput = git(['-C', destination, 'rev-parse', 'HEAD']).trim();
        return {
          success: true,
          path: destination,
          branch: branchOutput,
          sha: shaOutput,
          recentCommits: logOutput.split('\n'),
          output: output.trim(),
        };
      } catch (error: unknown) {
        const e = error as { message?: string; stderr?: string };
        const message = `${e?.message ?? String(error)}${e?.stderr ? `\n${e.stderr}` : ''}`;
        const sanitized = message
          .replaceAll(token, '<TOKEN>')
          .replaceAll(authHeader, 'AUTHORIZATION: <REDACTED>');
        throw new Error(`Clone failed: ${sanitized}`);
      }
    },
  });
}
