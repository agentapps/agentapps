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
    // An archived issue can be restored in Linear, so this is not destructive (this app has no unarchive tool).
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { issueId } = args as { issueId: string };
      validateIssueId(issueId);

      const result = await client.archiveIssue(issueId);
      return { success: !!result.success, issueId };
    },
  });
}
