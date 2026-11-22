import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { WORKFLOW_STATE_FIELDS } from './_fields.js';
import { extractWorkflowState, validateUuid } from './_linear-helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapLinearCall } from './utils.js';

export function registerListWorkflowStatesTool(app: AgentApp): void {
  app.tool('linear-list-workflow-states', {
    description:
      'List workflow states for a team. Returns curated rows { id, name, type, color, position, description }. Params: teamId, limit (1-100, def 50), startCursor, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team UUID.' },
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 50.',
        },
        startCursor: {
          type: 'string',
          description: 'Linear relay cursor from previous response.nextCursor.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Linear state nodes. Default false.',
        },
      },
      required: ['teamId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { teamId, limit, startCursor, fields, includeRaw } = args as {
        teamId: string;
        limit?: number;
        startCursor?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateUuid(teamId, 'teamId');

      const team = await wrapLinearCall(() => client.team(teamId));
      const pageSize = sanitizeLimit(limit, { max: 100, default: 50 });
      const connection = await wrapLinearCall(() =>
        team.states({
          first: pageSize,
          ...(startCursor ? { after: startCursor } : {}),
        }),
      );

      const nodes = connection.nodes ?? [];
      const shaped = nodes
        .map((n: any) => extractWorkflowState(n))
        .filter((s): s is NonNullable<typeof s> => s !== null);
      const states = resolveFieldsList(shaped as any, nodes, {
        includeRaw,
        fields,
        defaultFields: WORKFLOW_STATE_FIELDS,
      });

      return {
        teamId,
        states,
        total: states.length,
        hasMore: !!connection.pageInfo?.hasNextPage,
        nextCursor: connection.pageInfo?.endCursor ?? null,
      };
    },
  });
}
