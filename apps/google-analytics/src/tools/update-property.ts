import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * analytics-update-property — Update mutable fields of a GA4 property.
 */
export function registerUpdatePropertyTool(app: AgentApp): void {
  app.tool('analytics-update-property', {
    description:
      'Update mutable fields of a GA4 property (displayName, timeZone, currencyCode, industryCategory). Returns { property: <updated> }.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        displayName: { type: 'string', description: 'New display name' },
        timeZone: { type: 'string', description: 'New IANA time zone' },
        currencyCode: { type: 'string', description: 'New ISO 4217 currency code' },
        industryCategory: { type: 'string', description: 'New industry enum' },
      },
      required: ['propertyId'],
    },
    // Setting the fields again undoes it; destructiveHint is for changes the app cannot undo.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { admin, email } = await createAnalyticsClients(secrets);

      const name = parsePropertyName(a.propertyId as string);
      const updates: Record<string, any> = {};
      const mask: string[] = [];
      if (typeof a.displayName === 'string' && a.displayName.trim()) {
        updates.displayName = a.displayName.trim();
        mask.push('displayName');
      }
      if (typeof a.timeZone === 'string' && a.timeZone.trim()) {
        updates.timeZone = a.timeZone.trim();
        mask.push('timeZone');
      }
      if (typeof a.currencyCode === 'string' && a.currencyCode.trim()) {
        updates.currencyCode = a.currencyCode.trim();
        mask.push('currencyCode');
      }
      if (typeof a.industryCategory === 'string' && a.industryCategory.trim()) {
        updates.industryCategory = a.industryCategory.trim();
        mask.push('industryCategory');
      }
      if (!mask.length) {
        throw new Error(
          '[INVALID_ARGUMENT] at least one of displayName, timeZone, currencyCode, industryCategory must be provided',
        );
      }

      try {
        const response = await admin.properties.patch({
          name,
          updateMask: mask.join(','),
          requestBody: updates,
        });
        const p = response.data;
        return {
          account: email,
          property: {
            propertyId: propertyIdOf(p.name),
            name: p.name,
            displayName: p.displayName,
            parent: p.parent,
            timeZone: p.timeZone,
            currencyCode: p.currencyCode,
            industryCategory: p.industryCategory,
            updateTime: p.updateTime,
          },
          updatedFields: mask,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
