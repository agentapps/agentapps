import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId, validateUuid } from './_linear-helpers.js';
import { wrapLinearCall } from './utils.js';

export function registerAddLabelsToIssueTool(app: AgentApp): void {
  app.tool('add-labels-to-issue', {
    description:
      'Add labels to a Linear issue (deduped server-side against existing labels). Returns { issueId, added, total, labelIds }.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue UUID or identifier.' },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label UUIDs to add.',
        },
      },
      required: ['issueId', 'labelIds'],
    },
    // Merges into the current label set, so repeating the call adds nothing more.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { issueId, labelIds } = args as { issueId: string; labelIds: string[] };
      validateIssueId(issueId);
      for (const id of labelIds) validateUuid(id, 'labelIds[]');

      const issue = await wrapLinearCall(() => client.issue(issueId));
      const existing = await issue.labels();
      const currentIds = existing.nodes.map((l: any) => l.id as string);
      const nextIds = Array.from(new Set([...currentIds, ...labelIds]));
      const added = nextIds.length - currentIds.length;

      await wrapLinearCall(() => client.updateIssue(issue.id, { labelIds: nextIds }));
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        added,
        total: nextIds.length,
        labelIds: nextIds,
      };
    },
  });
}
