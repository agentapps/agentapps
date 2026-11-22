import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parseAccountName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * create-property — Create a new GA4 property under an account.
 */
export function registerCreatePropertyTool(app: AgentApp): void {
  app.tool('create-property', {
    description:
      'Create a new GA4 property under an account. Returns { property: { propertyId, displayName, parent, timeZone, currencyCode, ... } }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'GA4 account ID (numeric or "accounts/{id}")',
        },
        displayName: { type: 'string', description: 'Human-readable property name' },
        timeZone: { type: 'string', description: 'IANA time zone, e.g. "America/Los_Angeles"' },
        currencyCode: { type: 'string', description: 'ISO 4217 currency, e.g. "USD"' },
        industryCategory: {
          type: 'string',
          description: 'GA4 industry enum, e.g. "TECHNOLOGY", "RETAIL", "FINANCE"',
        },
      },
      required: ['accountId', 'displayName', 'timeZone'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { admin, email } = await createAnalyticsClients(secrets);

      const account = parseAccountName(a.accountId as string);
      const displayName = String(a.displayName || '').trim();
      const timeZone = String(a.timeZone || '').trim();
      if (!displayName)
        throw new Error('[INVALID_ARGUMENT] displayName must be a non-empty string');
      if (!timeZone)
        throw new Error('[INVALID_ARGUMENT] timeZone must be a non-empty IANA time zone');

      try {
        const response = await admin.properties.create({
          requestBody: {
            parent: account,
            displayName,
            timeZone,
            currencyCode: (a.currencyCode as string) || undefined,
            industryCategory: (a.industryCategory as string) || undefined,
          },
        });
        const p = response.data;
        return {
          account: email,
          property: {
            propertyId: propertyIdOf(p.name),
            name: p.name,
            displayName: p.displayName,
            parent: p.parent,
            propertyType: p.propertyType,
            timeZone: p.timeZone,
            currencyCode: p.currencyCode,
            industryCategory: p.industryCategory,
            serviceLevel: p.serviceLevel,
            createTime: p.createTime,
          },
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
