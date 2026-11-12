import type { AgentApp } from '@agentapps/sdk';
import { createClient } from './_helpers.js';

/**
 * railway-get-deploy-logs — Get runtime/deployment logs for a deployment.
 */
export function registerGetDeployLogsTool(app: AgentApp): void {
  app.tool('railway-get-deploy-logs', {
    description:
      'Get runtime/deployment logs for a deployment. Shows application output, errors, and startup logs.',
    parameters: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID to get runtime logs for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log lines to return (default: 100, max: 500)',
          default: 100,
        },
        filter: {
          type: 'string',
          description: 'Optional text filter to search within logs',
        },
      },
      required: ['deploymentId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        deploymentId,
        limit = 100,
        filter,
      } = args as {
        deploymentId: string;
        limit?: number;
        filter?: string;
      };

      const client = await createClient(ctx);
      const result = await client.getDeploymentLogs(deploymentId, Math.min(limit, 500), filter);

      if (result.logs.length === 0) {
        return `No runtime logs found for deployment ${deploymentId}${filter ? ` matching "${filter}"` : ''}.`;
      }

      const formattedLogs = result.logs
        .map((log) => {
          const severity = log.severity ? `[${log.severity}]` : '';
          const time = new Date(log.timestamp).toISOString().split('T')[1].split('.')[0];
          return `${time} ${severity} ${log.message}`;
        })
        .join('\n');

      return `Runtime logs for deployment ${deploymentId} (${result.total} lines):\n\n\`\`\`\n${formattedLogs}\n\`\`\``;
    },
  });
}
