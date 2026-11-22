/**
 * query_table — query rows from a Supabase table with filtering, ordering, and pagination.
 */

import type { AgentApp } from '@agentapps/sdk';
import { supabaseRequest } from '../lib/supabase-client.js';

export function registerQueryTableTool(app: AgentApp): void {
  app.tool('query_table', {
    description:
      'Query rows from a Supabase table. Supports PostgREST filtering (e.g. "age=gt.18"), column selection, ordering, and pagination.',
    parameters: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name to query.',
        },
        select: {
          type: 'string',
          description: 'Comma-separated columns to select (default "*").',
        },
        filter: {
          type: 'string',
          description:
            'PostgREST filter string, e.g. "age=gt.18" or "status=eq.active". Multiple filters separated by "&".',
        },
        order: {
          type: 'string',
          description: 'Order clause, e.g. "created_at.desc" or "name.asc".',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of rows to return (default 20).',
        },
        offset: {
          type: 'number',
          description: 'Number of rows to skip (default 0).',
        },
      },
      required: ['table'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const table = args.table as string;
      const select = (args.select as string) || '*';
      const filter = args.filter as string | undefined;
      const order = args.order as string | undefined;
      const limit = (args.limit as number) || 20;
      const offset = (args.offset as number) || 0;

      const params: Record<string, string> = {
        select,
        limit: String(limit),
        offset: String(offset),
      };
      if (order) params.order = order;

      // Parse filter string into individual query params
      // e.g. "age=gt.18&status=eq.active" -> { age: "gt.18", status: "eq.active" }
      if (filter) {
        const filterParts = filter.split('&');
        for (const part of filterParts) {
          const eqIndex = part.indexOf('=');
          if (eqIndex > 0) {
            const key = part.slice(0, eqIndex);
            const value = part.slice(eqIndex + 1);
            params[key] = value;
          }
        }
      }

      const result = (await supabaseRequest(
        'GET',
        `/rest/v1/${table}`,
        {
          params,
          headers: { Prefer: 'count=exact' },
        },
        ctx,
      )) as { data: unknown; headers: Record<string, string> };

      // Parse total count from content-range header: "0-19/42"
      let total: number | null = null;
      const contentRange = result.headers['content-range'];
      if (contentRange) {
        const match = contentRange.match(/\/(\d+|\*)/);
        if (match && match[1] !== '*') {
          total = parseInt(match[1], 10);
        }
      }

      return {
        data: result.data,
        total,
        limit,
        offset,
      };
    },
  });
}
