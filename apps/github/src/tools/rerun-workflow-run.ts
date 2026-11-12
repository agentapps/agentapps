import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerRerunWorkflowRunTool(app: AgentApp) {
  app.tool('rerun-workflow-run', {
    annotations: { readOnlyHint: false },
    description: 'Re-run a workflow run. Default re-runs only failed jobs.',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow run id' },
        mode: {
          type: 'string',
          enum: ['failed', 'all'],
          description: 'Which jobs to re-run (default: failed)',
        },
        enable_debug_logging: { type: 'boolean', description: 'Enable debug logging' },
      },
      required: ['owner', 'repo', 'run_id'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, run_id, mode, enable_debug_logging } = args as {
        owner: string;
        repo: string;
        run_id: number;
        mode?: 'failed' | 'all';
        enable_debug_logging?: boolean;
      };
      const endpoint =
        mode === 'all'
          ? `/repos/${owner}/${repo}/actions/runs/${run_id}/rerun`
          : `/repos/${owner}/${repo}/actions/runs/${run_id}/rerun-failed-jobs`;
      return await githubRequest(ctx, endpoint, {
        method: 'POST',
        body: { enable_debug_logging: enable_debug_logging ?? false },
      });
    },
  });
}
