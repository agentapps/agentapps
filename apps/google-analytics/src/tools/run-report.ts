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
 * analytics-run-report — Run a GA4 report.
 */
export function registerRunReportTool(app: AgentApp): void {
  app.tool('analytics-run-report', {
    description:
      'Run a GA4 report. Returns { dimensionHeaders, metricHeaders, rows, rowCount, totals?, metadata, propertyQuota? }. Dates accept ISO ("2024-01-01") or relative ("7daysAgo", "yesterday", "today").',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        dimensions: {
          type: 'array',
          description: 'Dimension API names, e.g. ["country", "deviceCategory"]',
          items: { type: 'string' },
        },
        metrics: {
          type: 'array',
          description: 'Metric API names, e.g. ["activeUsers", "sessions"]',
          items: { type: 'string' },
        },
        dateRanges: {
          type: 'array',
          description: 'Date ranges, e.g. [{ "startDate": "7daysAgo", "endDate": "yesterday" }]',
          items: {
            type: 'object',
            properties: {
              startDate: { type: 'string' },
              endDate: { type: 'string' },
              name: { type: 'string' },
            },
            required: ['startDate', 'endDate'],
          },
        },
        dimensionFilter: {
          type: 'object',
          description: 'GA4 FilterExpression for dimensions (see GA4 Data API docs)',
        },
        metricFilter: {
          type: 'object',
          description: 'GA4 FilterExpression for metrics (applied after aggregation)',
        },
        orderBys: {
          type: 'array',
          description:
            'Order by config, e.g. [{ "metric": { "metricName": "sessions" }, "desc": true }]',
          items: { type: 'object' },
        },
        limit: { type: 'number', description: 'Max rows (default 10000, max 250000)' },
        offset: { type: 'number', description: 'Row offset (default 0)' },
        keepEmptyRows: { type: 'boolean', description: 'Include rows where all metrics are zero' },
        returnPropertyQuota: { type: 'boolean', description: 'Include quota info in response' },
        currencyCode: { type: 'string', description: 'ISO 4217 currency override (e.g. "USD")' },
        metricAggregations: {
          type: 'array',
          description: 'Aggregations: TOTAL, MINIMUM, MAXIMUM',
          items: { type: 'string' },
        },
      },
      required: ['propertyId', 'metrics', 'dateRanges'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { data, email } = await createAnalyticsClients(secrets);

      const property = parsePropertyName(a.propertyId as string);
      const requestBody = buildReportRequest(
        a as unknown as RawReportArgs,
      ) as analyticsdata_v1beta.Schema$RunReportRequest;

      try {
        const response = await data.properties.runReport({ property, requestBody });
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
