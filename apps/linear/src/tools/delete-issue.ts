import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId } from './_linear-helpers.js';

export function registerDeleteIssueTool(app: AgentApp): void {
  app.tool('linear-delete-issue', {
    description: 'Permanently delete a Linear issue. Irreversible. Returns { success, issueId }.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue UUID or identifier.' },
      },
      required: ['issueId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { issueId } = args as { issueId: string };
      validateIssueId(issueId);

      const result = await client.deleteIssue(issueId);
      return { success: !!result.success, issueId };
    },
  });
}
