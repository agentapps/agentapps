import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  parseStreamId,
  pick,
} from '../lib/index.js';

/**
 * analytics-get-data-stream — Get a single data stream's details.
 */
export function registerGetDataStreamTool(app: AgentApp): void {
  app.tool('analytics-get-data-stream', {
    description:
      "Get a single data stream's details. Returns { stream: { streamId, displayName, type, webStreamData?, androidAppStreamData?, iosAppStreamData? } }.",
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        streamId: { type: 'string', description: 'Data stream ID (numeric)' },
      },
      required: ['propertyId', 'streamId'],
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

      const property = parsePropertyName(a.propertyId as string);
      const streamId = parseStreamId(a.streamId as string);
      const name = `${property}/dataStreams/${streamId}`;
      try {
        const response = await admin.properties.dataStreams.get({ name });
        const s = response.data;
        return {
          account: email,
          stream: {
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
          },
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
