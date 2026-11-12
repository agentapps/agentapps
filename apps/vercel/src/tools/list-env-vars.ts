/**
 * list_env_vars — list environment variables for a Vercel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListEnvVarsTool(app: AgentApp): void {
  app.tool('list_env_vars', {
    description: 'List all environment variables for a specific Vercel project.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Vercel project name or ID.',
        },
      },
      required: ['projectId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const projectId = args.projectId as string;
      const data = (await vercelRequest(
        'GET',
        `/v9/projects/${projectId}/env`,
        null,
        ctx,
      )) as Record<string, unknown>;
      return { envs: data.envs };
    },
  });
}
