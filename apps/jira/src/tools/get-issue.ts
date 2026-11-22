/**
 * get_issue — retrieve a single Jira issue by key.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerGetIssueTool(app: AgentApp): void {
  app.tool('get_issue', {
    description: 'Get detailed information about a specific Jira issue by its key (e.g. PROJ-123).',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
        fields: {
          type: 'string',
          description: 'Comma-separated list of field names to include.',
        },
      },
      required: ['issueKey'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;
      const params: Record<string, string | number | undefined> = {};
      if (args.fields) params.fields = args.fields as string;

      return await jiraRequest('GET', `/issue/${issueKey}`, { params }, ctx);
    },
  });
}
