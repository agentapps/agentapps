/**
 * add-comment — add a comment to a Jira issue.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerAddCommentTool(app: AgentApp): void {
  app.tool('add-comment', {
    description: 'Add a comment to a Jira issue. The comment body is plain text converted to ADF.',
    parameters: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The issue key (e.g. "PROJ-123").',
        },
        body: {
          type: 'string',
          description: 'The comment text.',
        },
      },
      required: ['issueKey', 'body'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const issueKey = args.issueKey as string;
      const body = args.body as string;

      return await jiraRequest(
        'POST',
        `/issue/${issueKey}/comment`,
        {
          body: {
            body: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: body }],
                },
              ],
            },
          },
        },
        ctx,
      );
    },
  });
}
