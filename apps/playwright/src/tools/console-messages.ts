import type { AgentApp } from '@agentapps/sdk';
import { consoleMessages, getLastActionTime, getLastNavigationTime } from '../browser.js';

export function registerConsoleMessagesTool(app: AgentApp): void {
  app.tool('console-messages', {
    description: 'Returns console messages with filtering options',
    parameters: {
      type: 'object',
      properties: {
        level: {
          type: 'string',
          enum: ['error', 'warning', 'info', 'debug'],
          default: 'info',
          description:
            'Level of the console messages to return. Each level includes the messages of more severe levels. Defaults to "info".',
        },
        limit: {
          type: 'number',
          default: 50,
          description: 'Max messages to return (default: 50)',
        },
        offset: {
          type: 'number',
          default: 0,
          description: 'Skip first N messages (for pagination)',
        },
        search: {
          type: 'string',
          description: 'Filter messages containing this text (case-insensitive)',
        },
        sinceTimestamp: {
          type: 'number',
          description:
            'Only messages after this timestamp (ms). Use lastTimestamp from previous response to iterate.',
        },
        since: {
          type: 'string',
          enum: ['all', 'last-navigation', 'last-action'],
          default: 'all',
          description:
            'Preset filters: all, since last navigation, since last action (click/type/etc)',
        },
      },
    },
    annotations: { readOnlyHint: false },
    handler: async (args) => {
      const level = (args.level as string) || 'info';
      const limit = Math.min((args.limit as number) || 50, 200);
      const offset = (args.offset as number) || 0;
      const search = (args.search as string)?.toLowerCase();
      const sinceTimestamp = args.sinceTimestamp as number | undefined;
      const since = (args.since as string) || 'all';

      const levels = ['error', 'warning', 'info', 'debug'];
      const minLevel = levels.indexOf(level);

      // Determine the timestamp filter
      let filterTimestamp = 0;
      if (sinceTimestamp) {
        filterTimestamp = sinceTimestamp;
      } else if (since === 'last-navigation') {
        filterTimestamp = getLastNavigationTime();
      } else if (since === 'last-action') {
        filterTimestamp = getLastActionTime();
      }

      // Apply all filters
      const filtered = consoleMessages.filter((msg) => {
        // Level filter
        const msgLevel = msg.level === 'warn' ? 'warning' : msg.level;
        if (levels.indexOf(msgLevel) > minLevel) return false;

        // Timestamp filter
        if (filterTimestamp && msg.timestamp <= filterTimestamp) return false;

        // Search filter
        if (search && !msg.text.toLowerCase().includes(search)) return false;

        return true;
      });

      const total = filtered.length;

      // Apply pagination
      const paginated = filtered.slice(offset, offset + limit);

      if (paginated.length === 0) {
        return JSON.stringify({
          messages: [],
          count: 0,
          total,
          hasMore: false,
          lastTimestamp: Date.now(),
        });
      }

      const lastTimestamp = paginated[paginated.length - 1].timestamp;

      return JSON.stringify({
        messages: paginated.map((msg) => ({
          level: msg.level.toUpperCase(),
          text: msg.text,
          timestamp: msg.timestamp,
        })),
        count: paginated.length,
        total,
        hasMore: offset + paginated.length < total,
        lastTimestamp,
      });
    },
  });
}
