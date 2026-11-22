/**
 * delete_env_var — delete an environment variable from a Vercel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerDeleteEnvVarTool(app: AgentApp): void {
  app.tool('delete_env_var', {
    description:
      'Delete an environment variable from a Vercel project by its ID. Use list_env_vars to find the env var ID first.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Vercel project name or ID.',
        },
        envId: {
          type: 'string',
          description: 'The environment variable ID to delete.',
        },
      },
      required: ['projectId', 'envId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const projectId = args.projectId as string;
      const envId = args.envId as string;

      await vercelRequest('DELETE', `/v9/projects/${projectId}/env/${envId}`, null, ctx);
      return { deleted: true, envId };
    },
  });
}
