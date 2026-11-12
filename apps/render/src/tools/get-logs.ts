import type { AgentApp } from '@agentapps/sdk';
import { renderLogsRequest } from '../lib/render-client.js';

interface RenderLogEntry {
  timestamp: string;
  message: string;
  level?: string;
}

/**
 * render-get-logs -- GET /logs (custom query param format).
 */
export function registerGetLogsTool(app: AgentApp): void {
  app.tool('render-get-logs', {
    description:
      'Get recent logs for one or more Render services. Requires the owner ID (use render-list-owners) and service IDs. Returns { logs: [{ timestamp, level?, message }], count }. Params: ownerId (required), serviceIds (required -- array of service IDs), limit? (default 100, max 500), text? (filter), level? (debug, info, warning, error).',
    parameters: {
      type: 'object',
      properties: {
        ownerId: {
          type: 'string',
          description: 'The owner/workspace ID (use render-list-owners to get IDs).',
        },
        serviceIds: {
          type: 'array',
          description: 'Array of service IDs to get logs from.',
          items: { type: 'string' },
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log lines to return (default: 100).',
          default: 100,
        },
        text: {
          type: 'string',
          description: 'Filter logs containing this text.',
        },
        level: {
          type: 'string',
          description: 'Filter by log level: debug, info, warning, error.',
        },
      },
      required: ['ownerId', 'serviceIds'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        ownerId,
        serviceIds,
        limit = 100,
        text,
        level,
      } = args as {
        ownerId: string;
        serviceIds: string[];
        limit?: number;
        text?: string;
        level?: string;
      };

      const query: Record<string, string | number | undefined> = {
        limit: Math.min(limit, 500),
      };
      if (text) query.text = text;
      if (level) query.level = level;

      const data = await renderLogsRequest<{ logs?: RenderLogEntry[] } | RenderLogEntry[]>(
        ctx,
        ownerId,
        serviceIds,
        query,
      );

      const logs: RenderLogEntry[] = Array.isArray(data)
        ? data
        : ((data as { logs?: RenderLogEntry[] })?.logs ?? []);

      const shaped = logs.map((log) => ({
        timestamp: log.timestamp,
        level: log.level ?? null,
        message: log.message,
      }));

      return { logs: shaped, count: shaped.length };
    },
  });
}
