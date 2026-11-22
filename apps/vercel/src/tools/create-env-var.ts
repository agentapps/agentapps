/**
 * create-env-var — create an environment variable for a Vercel project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { vercelRequest } from '../lib/vercel-client.js';

export function registerCreateEnvVarTool(app: AgentApp): void {
  app.tool('create-env-var', {
    description:
      'Create a new environment variable for a Vercel project. Returns the created env var object.',
    parameters: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The Vercel project name or ID.',
        },
        key: {
          type: 'string',
          description: 'The environment variable name.',
        },
        value: {
          type: 'string',
          description: 'The environment variable value.',
        },
        target: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['production', 'preview', 'development'],
          },
          description:
            'Target environments for this variable (e.g. ["production", "preview", "development"]).',
        },
        type: {
          type: 'string',
          enum: ['plain', 'secret', 'encrypted', 'sensitive', 'system'],
          description: 'The type of environment variable (default "encrypted").',
        },
      },
      required: ['projectId', 'key', 'value', 'target'],
    },
    annotations: {
      readOnlyHint: false,
      // A plain create with no upsert: it does not overwrite an existing variable.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const projectId = args.projectId as string;
      const body: Record<string, unknown> = {
        key: args.key,
        value: args.value,
        target: args.target,
        type: (args.type as string) || 'encrypted',
      };

      return await vercelRequest('POST', `/v10/projects/${projectId}/env`, { body }, ctx);
    },
  });
}
