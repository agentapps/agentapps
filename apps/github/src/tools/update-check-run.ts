import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerUpdateCheckRunTool(app: AgentApp) {
  app.tool('update-check-run', {
    annotations: { readOnlyHint: false },
    description: 'Update an existing check run.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        check_run_id: { type: 'number', description: 'Check run id' },
        name: { type: 'string' },
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
      },
      required: ['owner', 'repo', 'check_run_id'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, check_run_id, name, status, conclusion, output, details_url } = args as {
        owner: string;
        repo: string;
        check_run_id: number;
        name?: string;
        status?: string;
        conclusion?: string;
        output?: { title: string; summary: string; text?: string };
        details_url?: string;
      };
      if (status === 'completed' && !conclusion)
        throw new Error('`conclusion` is required when status is `completed`.');
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (status !== undefined) body.status = status;
      if (conclusion !== undefined) body.conclusion = conclusion;
      if (output !== undefined) body.output = output;
      if (details_url !== undefined) body.details_url = details_url;
      return await githubRequest(ctx, `/repos/${owner}/${repo}/check-runs/${check_run_id}`, {
        method: 'PATCH',
        body,
      });
    },
  });
}
