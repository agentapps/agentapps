import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerCreateCheckRunTool(app: AgentApp) {
  app.tool('create-check-run', {
    annotations: { readOnlyHint: false },
    description: 'Create a check run on a commit (GitHub App exclusive).',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        name: { type: 'string', description: 'Display name of the check' },
        head_sha: { type: 'string', description: 'Commit SHA' },
        status: { type: 'string', enum: ['queued', 'in_progress', 'completed'] },
        conclusion: {
          type: 'string',
          enum: [
            'success',
            'failure',
            'neutral',
            'cancelled',
            'skipped',
            'timed_out',
            'action_required',
          ],
        },
        output: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['title', 'summary'],
        },
        details_url: { type: 'string' },
        external_id: { type: 'string' },
      },
      required: ['owner', 'repo', 'name', 'head_sha'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, name, head_sha, status, conclusion, output, details_url, external_id } =
        args as {
          owner: string;
          repo: string;
          name: string;
          head_sha: string;
          status?: string;
          conclusion?: string;
          output?: { title: string; summary: string; text?: string };
          details_url?: string;
          external_id?: string;
        };
      if (!name || name.trim() === '') throw new Error('`name` must be a non-empty string.');
      if (!head_sha || head_sha.trim() === '')
        throw new Error('`head_sha` must be a non-empty SHA.');
      const effectiveStatus = status ?? 'queued';
      if (effectiveStatus === 'completed' && !conclusion)
        throw new Error('`conclusion` is required when status is `completed`.');
      return await githubRequest(ctx, `/repos/${owner}/${repo}/check-runs`, {
        method: 'POST',
        body: {
          name,
          head_sha,
          status: effectiveStatus,
          conclusion,
          output,
          details_url,
          external_id,
        },
      });
    },
  });
}
