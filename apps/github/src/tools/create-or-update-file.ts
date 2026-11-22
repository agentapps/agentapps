import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerCreateOrUpdateFileTool(app: AgentApp) {
  app.tool('create-or-update-file', {
    annotations: {
      readOnlyHint: false,
      // Replaces a file through a new commit; the previous content stays in the history.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    description:
      'Create or update a file in a repo. Pass `sha` of the existing file when updating.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File path in repository' },
        message: { type: 'string', description: 'Commit message' },
        content: { type: 'string', description: 'File content (will be base64 encoded)' },
        branch: { type: 'string', description: 'Branch name' },
        sha: { type: 'string', description: 'SHA of file being replaced (required for updates)' },
      },
      required: ['owner', 'repo', 'path', 'message', 'content'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, path, message, content, branch, sha } = args as {
        owner: string;
        repo: string;
        path: string;
        message: string;
        content: string;
        branch?: string;
        sha?: string;
      };
      if (!path || path.trim() === '') throw new Error('`path` must be a non-empty string.');
      if (path.startsWith('/')) throw new Error('`path` must not start with `/`.');
      if (path.split('/').some((s) => s === '..'))
        throw new Error('`path` must not contain `..` segments.');
      const safePath = path
        .split('/')
        .map((s) => encodeURIComponent(s))
        .join('/');
      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content).toString('base64'),
      };
      if (branch) body.branch = branch;
      if (sha) body.sha = sha;
      return await githubRequest(ctx, `/repos/${owner}/${repo}/contents/${safePath}`, {
        method: 'PUT',
        body,
      });
    },
  });
}
