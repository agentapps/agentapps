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
 * analytics-batch-run-reports — Run up to 5 GA4 reports in one call.
 */
export function registerBatchRunReportsTool(app: AgentApp): void {
  app.tool('analytics-batch-run-reports', {
    description:
      'Run up to 5 GA4 reports against the same property in one call. Returns { reports: [<RunReportResponse>...] }. Useful for dashboards.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        requests: {
          type: 'array',
          description:
            'Array of report requests (same shape as analytics-run-report parameters minus propertyId)',
          items: { type: 'object' },
        },
      },
      required: ['propertyId', 'requests'],
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
      const requests = a.requests as Array<unknown>;
      if (!Array.isArray(requests) || !requests.length) {
        throw new Error('[INVALID_ARGUMENT] requests must be a non-empty array');
      }
      if (requests.length > 5) {
        throw new Error('[INVALID_ARGUMENT] at most 5 requests per batch');
      }
      const normalizedRequests = requests.map((r) =>
        buildReportRequest(r as RawReportArgs),
      ) as analyticsdata_v1beta.Schema$RunReportRequest[];

      try {
        const response = await data.properties.batchRunReports({
          property,
          requestBody: { requests: normalizedRequests },
        });
        const reports = (response.data.reports || []).map(curateReport);
        return {
          account: email,
          propertyId: propertyIdOf(property),
          count: reports.length,
          reports,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
