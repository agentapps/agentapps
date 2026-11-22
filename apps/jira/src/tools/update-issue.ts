/**
 * update_issue — update an existing Jira issue.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerUpdateIssueTool(app: AgentApp): void {
  app.tool('update_issue', {
    description:
      'Update fields on an existing Jira issue. Only the provided fields will be changed.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
        summary: {
          type: 'string',
          description: 'New summary/title for the issue.',
        },
        description: {
          type: 'string',
          description: 'New description (plain text, will be converted to ADF).',
        },
        assigneeAccountId: {
          type: 'string',
          description: 'The account ID of the new assignee.',
        },
        priority: {
          type: 'string',
          description: 'New priority name: "Highest", "High", "Medium", "Low", or "Lowest".',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'New labels for the issue (replaces existing labels).',
        },
      },
      required: ['issueKey'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;
      const fields: Record<string, unknown> = {};

      if (args.summary) {
        fields.summary = args.summary as string;
      }

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

      return await jiraRequest('PUT', `/issue/${issueKey}`, { body: { fields } }, ctx);
    },
  });
}
