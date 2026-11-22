import type { AgentApp } from '@agentapps/sdk';
import { runnList } from '../lib/runn-client.js';
import type { RunnActual } from '../lib/types.js';
import { ACTUAL_FIELDS } from './_fields.js';
import { validateId } from './_runn-helpers.js';
import { resolveFieldsList, sanitizeLimit } from './utils.js';

/** Route to the most specific documented actuals endpoint. */
function actualsEndpoint(personId?: number, projectId?: number): string {
  if (personId !== undefined) return `/people/${personId}/actuals`;
  if (projectId !== undefined) return `/projects/${projectId}/actuals`;
  return '/actuals';
}

export function registerListActualsTool(app: AgentApp): void {
  app.tool('runn-list-actuals', {
    description:
      'List Runn actuals (logged timesheet hours by day). Returns { items: [{ id, date, personId, projectId, roleId, billableMinutes, nonbillableMinutes, ... }], total, hasMore, nextCursor }. Filter by personId OR projectId (not both). Params: personId?, projectId?, limit (1-200, def 50), cursor?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        personId: { type: 'number', description: "Scope to one person's actuals." },
        projectId: { type: 'number', description: "Scope to one project's actuals." },
        limit: { type: 'number', description: 'Results per page. Min 1, max 200, default 50.' },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response.nextCursor.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist per row.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Runn actual objects. Default false.',
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
      const { personId, projectId, limit, cursor, fields, includeRaw } = (args ?? {}) as {
        personId?: number;
        projectId?: number;
        limit?: number;
        cursor?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      if (personId !== undefined) validateId(personId, 'personId');
      if (projectId !== undefined) validateId(projectId, 'projectId');

      const page = await runnList<RunnActual>(actualsEndpoint(personId, projectId), ctx, {
        limit: sanitizeLimit(limit, { max: 200, default: 50 }),
        cursor,
      });
      const items = resolveFieldsList(page.values as any, page.values, {
        includeRaw,
        fields,
        defaultFields: ACTUAL_FIELDS,
      });
      return {
        items,
        total: items.length,
        hasMore: page.nextCursor !== null,
        nextCursor: page.nextCursor,
      };
    },
  });
}
