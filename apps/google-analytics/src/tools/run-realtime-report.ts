import type { AgentApp } from '@agentapps/sdk';
import type { analyticsdata_v1beta } from 'googleapis';
import {
  buildReportRequest,
  createAnalyticsClients,
  curateReport,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  propertyIdOf,
  type RawReportArgs,
} from '../lib/index.js';

/**
 * run-realtime-report — Run a GA4 realtime report (last 30 minutes).
 */
export function registerRunRealtimeReportTool(app: AgentApp): void {
  app.tool('run-realtime-report', {
    description:
      'Run a GA4 realtime report (last 30 minutes of activity). Returns { dimensionHeaders, metricHeaders, rows, rowCount, propertyQuota? }.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        dimensions: {
          type: 'array',
          description: 'Realtime dimension API names, e.g. ["country", "unifiedScreenName"]',
          items: { type: 'string' },
        },
        metrics: {
          type: 'array',
          description: 'Realtime metric API names, e.g. ["activeUsers"]',
          items: { type: 'string' },
        },
        dimensionFilter: { type: 'object', description: 'FilterExpression for dimensions' },
        metricFilter: { type: 'object', description: 'FilterExpression for metrics' },
        orderBys: { type: 'array', description: 'Order by config', items: { type: 'object' } },
        limit: { type: 'number', description: 'Max rows (default 10000)' },
        returnPropertyQuota: { type: 'boolean', description: 'Include quota info in response' },
      },
      required: ['propertyId', 'metrics'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { data, email } = await createAnalyticsClients(secrets);

      const property = parsePropertyName(a.propertyId as string);
      const requestBody = buildReportRequest(a as unknown as RawReportArgs, {
        realtime: true,
      }) as analyticsdata_v1beta.Schema$RunRealtimeReportRequest;

      try {
        const response = await data.properties.runRealtimeReport({ property, requestBody });
        return {
          account: email,
          propertyId: propertyIdOf(property),
          ...curateReport(response.data),
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
