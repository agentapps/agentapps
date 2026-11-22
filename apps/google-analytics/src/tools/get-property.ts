import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * analytics-get-property — Get a GA4 property's details.
 */
export function registerGetPropertyTool(app: AgentApp): void {
  app.tool('analytics-get-property', {
    description:
      "Get a GA4 property's details. Returns { property: { propertyId, displayName, propertyType, parent, timeZone, currencyCode, industryCategory, serviceLevel, createTime, updateTime } }.",
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
      const { admin, email } = await createAnalyticsClients(secrets);

      const name = parsePropertyName(a.propertyId as string);
      try {
        const response = await admin.properties.get({ name });
        const p = response.data;
        return {
          account: email,
          property: {
            propertyId: propertyIdOf(p.name),
            name: p.name,
            displayName: p.displayName,
            propertyType: p.propertyType,
            parent: p.parent,
            timeZone: p.timeZone,
            currencyCode: p.currencyCode,
            industryCategory: p.industryCategory,
            serviceLevel: p.serviceLevel,
            account: p.account,
            createTime: p.createTime,
            updateTime: p.updateTime,
            deleteTime: p.deleteTime,
          },
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
