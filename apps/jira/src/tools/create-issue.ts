/**
 * create_issue — create a new Jira issue.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerCreateIssueTool(app: AgentApp): void {
  app.tool('create_issue', {
    description:
      'Create a new issue in Jira. Returns the created issue object with its key and ID.',
    parameters: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'The project key (e.g. "PROJ").',
        },
        issueType: {
          type: 'string',
          description: 'The issue type name (e.g. "Bug", "Task", "Story", "Epic").',
        },
        summary: {
          type: 'string',
          description: 'The issue summary/title.',
        },
        description: {
          type: 'string',
          description: 'The issue description (plain text, will be converted to ADF).',
        },
        assigneeAccountId: {
          type: 'string',
          description: 'The account ID of the assignee.',
        },
        priority: {
          type: 'string',
          description: 'Priority name: "Highest", "High", "Medium", "Low", or "Lowest".',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply to the issue.',
        },
      },
      required: ['projectKey', 'issueType', 'summary'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const fields: Record<string, unknown> = {
        project: { key: args.projectKey as string },
        issuetype: { name: args.issueType as string },
        summary: args.summary as string,
      };

      if (args.description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: args.description as string }],
            },
          ],
        };
      }

      if (args.assigneeAccountId) {
        fields.assignee = { accountId: args.assigneeAccountId as string };
      }

      if (args.priority) {
        fields.priority = { name: args.priority as string };
      }

      if (args.labels) {
        fields.labels = args.labels as string[];
      }

      return await jiraRequest('POST', '/issue', { body: { fields } }, ctx);
    },
  });
}
