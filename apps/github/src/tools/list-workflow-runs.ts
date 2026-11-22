import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerListWorkflowRunsTool(app: AgentApp) {
  app.tool('list-workflow-runs', {
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description: 'List workflow runs for a repository',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflow_id: { type: 'string', description: 'Workflow ID or filename (optional)' },
        status: {
          type: 'string',
          enum: [
            'completed',
            'action_required',
            'cancelled',
            'failure',
            'neutral',
            'skipped',
            'stale',
            'success',
            'timed_out',
            'in_progress',
            'queued',
            'requested',
            'waiting',
          ],
          description: 'Filter by status',
        },
        per_page: { type: 'number', description: 'Results per page' },
      },
      required: ['owner', 'repo'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, workflow_id, status, per_page } = args as {
        owner: string;
        repo: string;
        workflow_id?: string;
        status?: string;
        per_page?: number;
      };
      const endpoint = workflow_id
        ? `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/runs`
        : `/repos/${owner}/${repo}/actions/runs`;
      return await githubRequest(ctx, endpoint, { params: { status, per_page } });
    },
  });
}
