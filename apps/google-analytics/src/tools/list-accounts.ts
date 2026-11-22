import type { AgentApp } from '@agentapps/sdk';
import {
  accountIdOf,
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
} from '../lib/index.js';

/**
 * list-accounts — List GA4 accounts accessible to the user.
 */
export function registerListAccountsTool(app: AgentApp): void {
  app.tool('list-accounts', {
    description:
      'List GA4 accounts accessible to the user. Returns { accounts: [{ accountId, name, displayName, regionCode, createTime }], count }.',
    parameters: {
      type: 'object',
      properties: {
        pageSize: { type: 'number', description: 'Max results per page (default 50, max 200)' },
        pageToken: { type: 'string', description: 'Pagination token from previous response' },
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
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { admin, email } = await createAnalyticsClients(secrets);

      try {
        const response = await admin.accounts.list({
          pageSize: (a.pageSize as number) || 50,
          pageToken: a.pageToken as string | undefined,
        });
        const accounts = (response.data.accounts || []).map((acc: any) => ({
          accountId: accountIdOf(acc.name),
          name: acc.name,
          displayName: acc.displayName,
          regionCode: acc.regionCode,
          createTime: acc.createTime,
          updateTime: acc.updateTime,
        }));
        return {
          account: email,
          count: accounts.length,
          accounts,
          nextPageToken: response.data.nextPageToken,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
