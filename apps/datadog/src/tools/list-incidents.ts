/**
 * list_incidents — list Datadog incidents.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerListIncidentsTool(app: AgentApp): void {
  app.tool('list_incidents', {
    description: 'List incidents from Datadog. Supports pagination via page size and offset.',
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'number',
          description: 'Number of incidents per page (default 10).',
        },
        pageOffset: {
          type: 'number',
          description: 'Offset for pagination (default 0).',
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
      const query: Record<string, string | number | boolean | undefined | null> = {};
      query['page[size]'] = (args.pageSize as number) || 10;
      if (args.pageOffset !== undefined) query['page[offset]'] = args.pageOffset as number;

      return await datadogRequest('GET', '/api/v2/incidents', { query }, ctx);
    },
  });
}
