import type { AgentApp } from '@agentapps/sdk';
import type { PlaudRecording } from '../lib/index.js';
import { getPlaudClient, mapRecording } from '../lib/index.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function registerSearchNotesTool(app: AgentApp): void {
  app.tool('search-notes', {
    description:
      'Search PLAUD recordings by keyword and/or date range. Filters are passed to the official Plaud MCP server; results are sorted by creation date (most recent first). At least one filter parameter is required.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Keyword to search in recording title and summary preview (case-insensitive)',
        },
        date_from: {
          type: 'string',
          description: 'Start date (ISO 8601, inclusive). Example: "2026-01-01"',
        },
        date_to: {
          type: 'string',
          description: 'End date (ISO 8601, inclusive). Example: "2026-01-31"',
        },
        limit: {
          type: 'number',
          description: `Maximum number of results to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
          default: DEFAULT_LIMIT,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
      destructiveHint: false,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const { query, date_from, date_to } = a as {
        query?: string;
        date_from?: string;
        date_to?: string;
        limit?: number;
      };
      const limit = Math.min(
        Math.max(1, (a.limit as number | undefined) ?? DEFAULT_LIMIT),
        MAX_LIMIT,
      );

      // Require at least one filter
      if (!query && !date_from && !date_to) {
        throw new Error('At least one filter parameter is required (query, date_from, or date_to)');
      }

      const client = await getPlaudClient(ctx);

      // The official Plaud MCP server supports server-side filtering in list_files.
      // We pass query/date filters directly and apply client-side pagination only.
      const mcpArgs: Record<string, unknown> = {};
      if (query) mcpArgs.query = query;
      if (date_from) mcpArgs.date_from = date_from;
      if (date_to) mcpArgs.date_to = date_to;

      const raw = (await client.listRecordings(mcpArgs)) as Record<string, unknown>;

      const list: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any).data)
          ? (raw as any).data
          : Array.isArray((raw as any).list)
            ? (raw as any).list
            : [];

      const allRecordings: PlaudRecording[] = list.map((item) => mapRecording(item));

      const results = allRecordings
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        })
        .slice(0, limit);

      return {
        recordings: results,
        total: results.length,
      };
    },
  });
}
