import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerCancelWorkflowRunTool(app: AgentApp) {
  app.tool('cancel-workflow-run', {
    annotations: {
      readOnlyHint: false,
      // A cancelled run can be started again with rerun-workflow-run.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    description: 'Cancel a workflow run that is in progress.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow run id' },
      },
      required: ['owner', 'repo', 'run_id'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, run_id } = args as { owner: string; repo: string; run_id: number };
      return await githubRequest(ctx, `/repos/${owner}/${repo}/actions/runs/${run_id}/cancel`, {
        method: 'POST',
      });
    },
  });
}
