import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId } from './_linear-helpers.js';
import { wrapLinearCall } from './utils.js';

export function registerRemoveIssuesFromProjectTool(app: AgentApp): void {
  app.tool('linear-remove-issues-from-project', {
    description:
      'Detach one or more Linear issues from their project. Returns { removed, failed, results: [{ issueId, identifier?, success, error? }] }.',
    parameters: {
      type: 'object',
      properties: {
        issueIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issue UUIDs or identifiers to detach.',
        },
      },
      required: ['issueIds'],
    },
    annotations: { sensitive: true, readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { issueIds } = args as { issueIds: string[] };

      const results: {
        issueId: string;
        identifier?: string;
        success: boolean;
        error?: string;
      }[] = [];

      for (const issueId of issueIds) {
        try {
          validateIssueId(issueId);
          // Linear accepts empty string / null to detach — SDK v29 expects `projectId: null`.
          await wrapLinearCall(() => client.updateIssue(issueId, { projectId: null as any }));
          const issue = await wrapLinearCall(() => client.issue(issueId));
          results.push({ issueId, identifier: issue.identifier, success: true });
        } catch (error: any) {
          results.push({ issueId, success: false, error: error?.message ?? String(error) });
        }
      }

      const removed = results.filter((r) => r.success).length;
      const failed = results.length - removed;
      return { removed, failed, results };
    },
  });
}
