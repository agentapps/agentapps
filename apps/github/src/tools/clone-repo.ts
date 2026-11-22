import { execSync } from 'node:child_process';
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
      const token = await resolveUserToken(ctx);
      const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
      const branchFlag = branch ? `--branch ${branch}` : '';
      const cmd = `git clone ${branchFlag} "${cloneUrl}" "${destination}" 2>&1`;
      try {
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 120_000 });
        const logOutput = execSync(`git -C "${destination}" log --oneline -5 2>&1`, {
          encoding: 'utf-8',
        }).trim();
        const branchOutput = execSync(`git -C "${destination}" branch --show-current 2>&1`, {
          encoding: 'utf-8',
        }).trim();
        const shaOutput = execSync(`git -C "${destination}" rev-parse HEAD 2>&1`, {
          encoding: 'utf-8',
        }).trim();
        return {
          success: true,
          path: destination,
          branch: branchOutput,
          sha: shaOutput,
          recentCommits: logOutput.split('\n'),
          output: output.trim(),
        };
      } catch (error: unknown) {
        const message = (error as { message?: string })?.message ?? String(error);
        const sanitized = message.replace(token, '<TOKEN>');
        throw new Error(`Clone failed: ${sanitized}`);
      }
    },
  });
}
