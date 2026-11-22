import type { AgentApp } from '@agentapps/sdk';
import { consoleMessages, getLastActionTime, getLastNavigationTime } from '../browser.js';

export function registerConsoleErrorsTool(app: AgentApp): void {
  app.tool('console-errors', {
    description: 'Returns only error messages (shortcut for level=error)',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 20,
          description: 'Max errors to return (default: 20)',
        },
        search: {
          type: 'string',
          description: 'Filter errors containing this text (case-insensitive)',
        },
        sinceTimestamp: {
          type: 'number',
          description: 'Only errors after this timestamp (ms)',
        },
        since: {
          type: 'string',
          enum: ['all', 'last-navigation', 'last-action'],
          default: 'all',
          description: 'Preset filters',
        },
      },
    },
    // Only filters the console buffer this process already holds in memory.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    handler: async (args) => {
      const limit = Math.min((args.limit as number) || 20, 100);
      const search = (args.search as string)?.toLowerCase();
      const sinceTimestamp = args.sinceTimestamp as number | undefined;
      const since = (args.since as string) || 'all';

      // Determine the timestamp filter
      let filterTimestamp = 0;
      if (sinceTimestamp) {
        filterTimestamp = sinceTimestamp;
      } else if (since === 'last-navigation') {
        filterTimestamp = getLastNavigationTime();
      } else if (since === 'last-action') {
        filterTimestamp = getLastActionTime();
      }

      const errors = consoleMessages.filter((msg) => {
        if (msg.level !== 'error') return false;
        if (filterTimestamp && msg.timestamp <= filterTimestamp) return false;
        if (search && !msg.text.toLowerCase().includes(search)) return false;
        return true;
      });

      const paginated = errors.slice(0, limit);

      if (paginated.length === 0) {
        return JSON.stringify({ errors: [], count: 0, total: errors.length });
      }

      return JSON.stringify({
        errors: paginated.map((msg) => ({
          text: msg.text,
          timestamp: msg.timestamp,
        })),
        count: paginated.length,
        total: errors.length,
        lastTimestamp: paginated[paginated.length - 1].timestamp,
      });
    },
  });
}
