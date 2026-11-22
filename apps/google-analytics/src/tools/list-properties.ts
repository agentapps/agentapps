import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parseAccountName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * analytics-list-properties — List GA4 properties under an account.
 */
export function registerListPropertiesTool(app: AgentApp): void {
  app.tool('analytics-list-properties', {
    description:
      'List GA4 properties under an account. Returns { properties: [{ propertyId, displayName, propertyType, currencyCode, timeZone, industryCategory }], count }.',
    parameters: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'GA4 account ID (numeric or "accounts/{id}")',
        },
        pageSize: { type: 'number', description: 'Max results per page (default 50, max 200)' },
        pageToken: { type: 'string', description: 'Pagination token from previous response' },
        showDeleted: {
          type: 'boolean',
          description: 'Include soft-deleted properties (default false)',
        },
      },
      required: ['accountId'],
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

      const account = parseAccountName(a.accountId as string);
      try {
        const response = await admin.properties.list({
          filter: `parent:${account}`,
          pageSize: (a.pageSize as number) || 50,
          pageToken: a.pageToken as string | undefined,
          showDeleted: (a.showDeleted as boolean) || false,
        });
        const properties = (response.data.properties || []).map((p: any) => ({
          propertyId: propertyIdOf(p.name),
          name: p.name,
          displayName: p.displayName,
          propertyType: p.propertyType,
          parent: p.parent,
          timeZone: p.timeZone,
          currencyCode: p.currencyCode,
          industryCategory: p.industryCategory,
          serviceLevel: p.serviceLevel,
          createTime: p.createTime,
          updateTime: p.updateTime,
          deleteTime: p.deleteTime,
        }));
        return {
          account: email,
          count: properties.length,
          properties,
          nextPageToken: response.data.nextPageToken,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
