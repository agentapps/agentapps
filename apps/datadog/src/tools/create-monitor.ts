/**
 * create_monitor — create a new Datadog monitor.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerCreateMonitorTool(app: AgentApp): void {
  app.tool('create_monitor', {
    description:
      'Create a new Datadog monitor. Specify the monitor type, query, name, and optional notification message.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the monitor.',
        },
        type: {
          type: 'string',
          description:
            'The type of monitor (e.g. "metric alert", "query alert", "service check", "log alert").',
        },
        query: {
          type: 'string',
          description: 'The monitor query (e.g. "avg(last_5m):avg:system.cpu.user{*} > 90").',
        },
        message: {
          type: 'string',
          description:
            'Notification message to include when the monitor triggers. Supports @-mentions and {{variables}}.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags to associate with the monitor (e.g. ["env:production", "team:backend"]).',
        },
        priority: {
          type: 'number',
          description: 'Priority of the monitor (1-5, where 1 is highest).',
        },
      },
      required: ['name', 'type', 'query'],
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        name: args.name as string,
        type: args.type as string,
        query: args.query as string,
      };
      if (args.message) body.message = args.message as string;
      if (args.tags) body.tags = args.tags as string[];
      if (args.priority !== undefined) body.priority = args.priority as number;

      return await datadogRequest('POST', '/api/v1/monitor', { body }, ctx);
    },
  });
}
