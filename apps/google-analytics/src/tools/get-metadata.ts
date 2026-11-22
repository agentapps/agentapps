import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * get-metadata — Get all dimensions and metrics for a property.
 */
export function registerGetMetadataTool(app: AgentApp): void {
  app.tool('get-metadata', {
    description:
      'Get all dimensions and metrics available for a property, including custom ones. Returns { dimensions: [{ apiName, uiName, description, customDefinition }], metrics: [{ apiName, uiName, description, type, customDefinition }] }.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
      },
      required: ['propertyId'],
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
      try {
        const response = await data.properties.getMetadata({ name: `${property}/metadata` });
        const dims = (response.data.dimensions || []).map((d: any) => ({
          apiName: d.apiName,
          uiName: d.uiName,
          description: d.description,
          category: d.category,
          customDefinition: d.customDefinition || false,
          deprecatedApiNames: d.deprecatedApiNames,
        }));
        const mets = (response.data.metrics || []).map((m: any) => ({
          apiName: m.apiName,
          uiName: m.uiName,
          description: m.description,
          type: m.type,
          category: m.category,
          customDefinition: m.customDefinition || false,
          expression: m.expression,
          deprecatedApiNames: m.deprecatedApiNames,
        }));
        return {
          account: email,
          propertyId: propertyIdOf(property),
          dimensionsCount: dims.length,
          metricsCount: mets.length,
          dimensions: dims,
          metrics: mets,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
