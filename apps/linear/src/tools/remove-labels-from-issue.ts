import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId, validateUuid } from './_linear-helpers.js';
import { wrapLinearCall } from './utils.js';

export function registerRemoveLabelsFromIssueTool(app: AgentApp): void {
  app.tool('remove-labels-from-issue', {
    description:
      'Remove labels from a Linear issue. Returns { issueId, removed, total, labelIds }.',
    parameters: {
      type: 'object',
      properties: {
        issueId: { type: 'string', description: 'Issue UUID or identifier.' },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label UUIDs to remove.',
        },
      },
      required: ['issueId', 'labelIds'],
    },
    // Detaches labels (add-labels-to-issue puts them back); the labels themselves are kept.
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
      const toRemove = new Set(labelIds);
      const nextIds = currentIds.filter((id) => !toRemove.has(id));
      const removed = currentIds.length - nextIds.length;

      await wrapLinearCall(() => client.updateIssue(issue.id, { labelIds: nextIds }));
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        removed,
        total: nextIds.length,
        labelIds: nextIds,
      };
    },
  });
}
