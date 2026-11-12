import type { AgentApp } from '@agentapps/sdk';
import { githubRequest } from '../lib/github-client.js';
export function registerTriggerWorkflowTool(app: AgentApp) {
  app.tool('trigger-workflow', {
    annotations: { sensitive: true, readOnlyHint: false },
    description: 'Trigger a workflow dispatch event',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        workflow_id: { type: 'string', description: 'Workflow ID or filename' },
        ref: { type: 'string', description: 'Branch or tag name' },
        inputs: { type: 'object', description: 'Input parameters for the workflow' },
      },
      required: ['owner', 'repo', 'workflow_id', 'ref'],
    },
    handler: async (args, ctx) => {
      const { owner, repo, workflow_id, ref, inputs } = args as {
        owner: string;
        repo: string;
        workflow_id: string;
        ref: string;
        inputs?: Record<string, unknown>;
      };
      await githubRequest(
        ctx,
        `/repos/${owner}/${repo}/actions/workflows/${workflow_id}/dispatches`,
        { method: 'POST', body: { ref, inputs: inputs ?? {} } },
      );
      return { success: true, message: 'Workflow triggered successfully' };
    },
  });
}
