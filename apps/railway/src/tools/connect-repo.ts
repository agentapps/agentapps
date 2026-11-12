import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-connect-repo — Connect a GitHub repository to a Railway service.
 */
export function registerConnectRepoTool(app: AgentApp): void {
  app.tool('railway-connect-repo', {
    description:
      'Connect a GitHub repository to a Railway service. Works with both public and private repos (if GitHub is connected in your Railway account). Automatically triggers a deployment.',
    parameters: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'The Railway service ID',
        },
        repo: {
          type: 'string',
          description: 'GitHub repository in format "owner/repo" (e.g., "myuser/myapp")',
        },
        branch: {
          type: 'string',
          description: 'Branch to deploy from (default: "main")',
        },
      },
      required: ['serviceId', 'repo'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        serviceId,
        repo,
        branch = 'main',
      } = args as {
        serviceId: string;
        repo: string;
        branch?: string;
      };

      const client = await createClient(ctx);
      const result = await client.connectRepo(serviceId, repo, branch);

      return {
        message: `GitHub repository connected successfully`,
        serviceId: result.id,
        serviceName: result.name,
        repo,
        branch,
        note: 'A deployment has been triggered automatically. Use railway-list-deployments to check status.',
      };
    },
  });
}
