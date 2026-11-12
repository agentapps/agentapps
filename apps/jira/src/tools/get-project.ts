/**
 * get_project — get detailed information about a Jira project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get_project', {
    description:
      'Get detailed information about a specific Jira project by its key or ID (e.g. "PROJ").',
    parameters: {
      type: 'object',
      properties: {
        projectKeyOrId: {
          type: 'string',
          description: 'The project key (e.g. "PROJ") or numeric project ID.',
        },
      },
      required: ['projectKeyOrId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const projectKeyOrId = args.projectKeyOrId as string;

      return await jiraRequest('GET', `/project/${projectKeyOrId}`, null, ctx);
    },
  });
}
