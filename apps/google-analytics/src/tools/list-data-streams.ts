import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  pick,
} from '../lib/index.js';

/**
 * list-data-streams — List data streams for a property.
 */
export function registerListDataStreamsTool(app: AgentApp): void {
  app.tool('list-data-streams', {
    description:
      'List data streams (web/iOS/Android) for a property. Returns { streams: [{ streamId, displayName, type, webStreamData, androidAppStreamData, iosAppStreamData }], count }.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        pageSize: { type: 'number', description: 'Max results per page (default 50)' },
        pageToken: { type: 'string', description: 'Pagination token from previous response' },
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

      const parent = parsePropertyName(a.propertyId as string);
      try {
        const response = await admin.properties.dataStreams.list({
          parent,
          pageSize: (a.pageSize as number) || 50,
          pageToken: a.pageToken as string | undefined,
        });
        const streams = (response.data.dataStreams || []).map((s: any) => ({
          streamId: s.name?.split('/').pop(),
          name: s.name,
          displayName: s.displayName,
          type: s.type,
          webStreamData: s.webStreamData
            ? pick(s.webStreamData, ['measurementId', 'firebaseAppId', 'defaultUri'])
            : undefined,
          androidAppStreamData: s.androidAppStreamData
            ? pick(s.androidAppStreamData, ['firebaseAppId', 'packageName'])
            : undefined,
          iosAppStreamData: s.iosAppStreamData
            ? pick(s.iosAppStreamData, ['firebaseAppId', 'bundleId'])
            : undefined,
          createTime: s.createTime,
          updateTime: s.updateTime,
        }));
        return {
          account: email,
          count: streams.length,
          streams,
          nextPageToken: response.data.nextPageToken,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
