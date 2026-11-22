import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { TEAM_FIELDS } from './_fields.js';
import { extractTeam } from './_linear-helpers.js';
import { resolveFieldsList, sanitizeLimit, wrapLinearCall } from './utils.js';

export function registerListTeamsTool(app: AgentApp): void {
  app.tool('list-teams', {
    description:
      'List Linear teams. Returns curated rows { id, name, key, icon, color, description, private }. Params: limit (1-100, def 50), startCursor, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
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
          description: 'Return raw Linear team nodes. Default false.',
        },
      },
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
      const { limit, startCursor, fields, includeRaw } = args as {
        limit?: number;
        startCursor?: string;
        fields?: string[];
        includeRaw?: boolean;
      };

      const pageSize = sanitizeLimit(limit, { max: 100, default: 50 });
      const connection = await wrapLinearCall(() =>
        client.teams({
          first: pageSize,
          ...(startCursor ? { after: startCursor } : {}),
        }),
      );
      const nodes = connection.nodes ?? [];
      const shaped = nodes
        .map((n: any) => extractTeam(n))
        .filter((t): t is NonNullable<typeof t> => t !== null);
      const teams = resolveFieldsList(shaped as any, nodes, {
        includeRaw,
        fields,
        defaultFields: TEAM_FIELDS,
      });

      return {
        teams,
        total: teams.length,
        hasMore: !!connection.pageInfo?.hasNextPage,
        nextCursor: connection.pageInfo?.endCursor ?? null,
      };
    },
  });
}
