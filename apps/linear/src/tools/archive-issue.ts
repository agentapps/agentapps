import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId } from './_linear-helpers.js';

export function registerArchiveIssueTool(app: AgentApp): void {
  app.tool('linear-archive-issue', {
    description:
      'Archive a Linear issue (soft delete). Reversible via un-archive. Returns { success, issueId }.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue UUID or identifier.' },
      },
      required: ['issueId'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { issueId } = args as { issueId: string };
      validateIssueId(issueId);

      const result = await client.archiveIssue(issueId);
      return { success: !!result.success, issueId };
    },
  });
}
