import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-deploy-public-repo — Deploy a public GitHub repository to Railway.
 */
export function registerDeployPublicRepoTool(app: AgentApp): void {
  app.tool('railway-deploy-public-repo', {
    description:
      'Deploy a public GitHub repository to Railway. Creates a new service from the repo. Only works with PUBLIC repositories. For private repos, use railway-connect-repo instead.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Railway project ID',
        },
        repo: {
          type: 'string',
          description: 'Public GitHub repository in format "owner/repo" (e.g., "myuser/myapp")',
        },
        branch: {
          type: 'string',
          description: 'Branch to deploy from (default: "main")',
        },
        environmentId: {
          type: 'string',
          description: 'The Railway environment ID (optional)',
        },
      },
      required: ['projectId', 'repo'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        projectId,
        repo,
        branch = 'main',
        environmentId,
      } = args as {
        projectId: string;
        repo: string;
        branch?: string;
        environmentId?: string;
      };

      const client = await createClient(ctx);

      try {
        const serviceId = await client.deployPublicRepo(projectId, repo, branch, environmentId);

        return {
          message: `Public repository deployed successfully`,
          serviceId,
          repo,
          branch,
          note: 'A new service has been created and deployment triggered.',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('public') || errorMessage.includes('Only public')) {
          throw new Error(
            `This mutation only works with public repositories. For private repos, first create a service with railway-create-service, then use railway-connect-repo to connect your private GitHub repository.`,
          );
        }
        throw error;
      }
    },
  });
}
