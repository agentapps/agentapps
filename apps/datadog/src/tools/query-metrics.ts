/**
 * query-metrics — query Datadog metrics.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerQueryMetricsTool(app: AgentApp): void {
  app.tool('query-metrics', {
    description:
      'Query time-series metrics from Datadog. Requires a metric query string and a time range (epoch seconds).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The Datadog metrics query (e.g. "avg:system.cpu.user{*}").',
        },
        from: {
          type: 'number',
          description: 'Start of the query window as a UNIX epoch timestamp (seconds).',
        },
        to: {
          type: 'number',
          description: 'End of the query window as a UNIX epoch timestamp (seconds).',
        },
      },
      required: ['query', 'from', 'to'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      return await datadogRequest(
        'GET',
        '/api/v1/query',
        {
          query: {
            query: args.query as string,
            from: args.from as number,
            to: args.to as number,
          },
        },
        ctx,
      );
    },
  });
}
