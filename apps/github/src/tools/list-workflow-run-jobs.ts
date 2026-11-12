import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerListWorkflowRunJobsTool(app: AgentApp) {
  app.tool('list-workflow-run-jobs', {
    annotations: { readOnlyHint: true },
    description: 'List jobs of a workflow run.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow run id' },
        filter: { type: 'string', enum: ['latest', 'all'], description: 'Filter by attempt' },
        per_page: { type: 'number' },
        page: { type: 'number' },
      },
      required: ['owner', 'repo', 'run_id'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, run_id, filter, per_page, page } = args as {
        owner: string;
        repo: string;
        run_id: number;
        filter?: string;
        per_page?: number;
        page?: number;
      };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/actions/runs/${run_id}/jobs`, {
        params: { filter, per_page, page },
      });
    },
  });
}
