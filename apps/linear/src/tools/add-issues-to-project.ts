import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateIssueId, validateUuid } from './_linear-helpers.js';
import { wrapLinearCall } from './utils.js';

export function registerAddIssuesToProjectTool(app: AgentApp): void {
  app.tool('linear-add-issues-to-project', {
    description:
      'Attach one or more Linear issues to a project. Returns { projectId, added, failed, results: [{ issueId, identifier?, success, error? }] }.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID.' },
        issueIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Issue UUIDs or identifiers.',
        },
      },
      required: ['projectId', 'issueIds'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { projectId, issueIds } = args as { projectId: string; issueIds: string[] };
      validateUuid(projectId, 'projectId');

      const results: {
        issueId: string;
        identifier?: string;
        success: boolean;
        error?: string;
      }[] = [];

      for (const issueId of issueIds) {
        try {
          validateIssueId(issueId);
          await wrapLinearCall(() => client.updateIssue(issueId, { projectId }));
          const issue = await wrapLinearCall(() => client.issue(issueId));
          results.push({ issueId, identifier: issue.identifier, success: true });
        } catch (error: any) {
          results.push({ issueId, success: false, error: error?.message ?? String(error) });
        }
      }

      const added = results.filter((r) => r.success).length;
      const failed = results.length - added;
      return { projectId, added, failed, results };
    },
  });
}
