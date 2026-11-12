/**
 * list_deployments — list Vercel deployments with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerListDeploymentsTool(app: AgentApp): void {
  app.tool('list_deployments', {
    description:
      'List deployments from your Vercel account. Supports filtering by project, state, and target environment.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter deployments by project name or ID.',
        },
        limit: {
          type: 'number',
          description: 'Number of deployments to return (default 20).',
        },
        state: {
          type: 'string',
          enum: ['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED'],
          description: 'Filter deployments by state.',
        },
        target: {
          type: 'string',
          enum: ['production', 'preview'],
          description: 'Filter deployments by target environment.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        limit: (args.limit as number) || 20,
      };
      if (args.projectId) params.projectId = args.projectId;
      if (args.state) params.state = args.state;
      if (args.target) params.target = args.target;

      const data = (await vercelRequest('GET', '/v6/deployments', { params }, ctx)) as Record<
        string,
        unknown
      >;
      return { deployments: data.deployments, pagination: data.pagination };
    },
  });
}
