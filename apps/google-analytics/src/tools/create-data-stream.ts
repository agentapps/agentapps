import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  pick,
} from '../lib/index.js';

/**
 * analytics-create-data-stream — Create a web/iOS/Android data stream.
 */
export function registerCreateDataStreamTool(app: AgentApp): void {
  app.tool('analytics-create-data-stream', {
    description:
      'Create a web/iOS/Android data stream under a property. Returns { stream: { streamId, displayName, type, webStreamData? } }.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'GA4 property ID (numeric or "properties/{id}")',
        },
        displayName: { type: 'string', description: 'Human-readable stream name' },
        type: {
          type: 'string',
          description:
            'Stream type: WEB_DATA_STREAM | ANDROID_APP_DATA_STREAM | IOS_APP_DATA_STREAM',
        },
        webStreamData: {
          type: 'object',
          description: 'Required for WEB_DATA_STREAM: { defaultUri }',
          properties: { defaultUri: { type: 'string' } },
        },
        androidAppStreamData: {
          type: 'object',
          description: 'Required for ANDROID_APP_DATA_STREAM: { packageName }',
          properties: { packageName: { type: 'string' } },
        },
        iosAppStreamData: {
          type: 'object',
          description: 'Required for IOS_APP_DATA_STREAM: { bundleId }',
          properties: { bundleId: { type: 'string' } },
        },
      },
      required: ['propertyId', 'displayName', 'type'],
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { admin, email } = await createAnalyticsClients(secrets);

      const parent = parsePropertyName(a.propertyId as string);
      const type = String(a.type || '').trim();
      const displayName = String(a.displayName || '').trim();
      if (!displayName)
        throw new Error('[INVALID_ARGUMENT] displayName must be a non-empty string');

      const validTypes = ['WEB_DATA_STREAM', 'ANDROID_APP_DATA_STREAM', 'IOS_APP_DATA_STREAM'];
      if (!validTypes.includes(type)) {
        throw new Error(`[INVALID_ARGUMENT] type must be one of: ${validTypes.join(', ')}`);
      }

      const requestBody: Record<string, any> = { displayName, type };
      if (type === 'WEB_DATA_STREAM') {
        const web = a.webStreamData as { defaultUri?: string } | undefined;
        if (!web?.defaultUri?.trim()) {
          throw new Error(
            '[INVALID_ARGUMENT] webStreamData.defaultUri is required for WEB_DATA_STREAM',
          );
        }
        try {
          const url = new URL(web.defaultUri.trim());
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('[INVALID_ARGUMENT] webStreamData.defaultUri must be http(s)');
          }
        } catch {
          throw new Error('[INVALID_ARGUMENT] webStreamData.defaultUri must be a valid URL');
        }
        requestBody.webStreamData = { defaultUri: web.defaultUri.trim() };
      }
      if (type === 'ANDROID_APP_DATA_STREAM') {
        const android = a.androidAppStreamData as { packageName?: string } | undefined;
        if (!android?.packageName?.trim()) {
          throw new Error(
            '[INVALID_ARGUMENT] androidAppStreamData.packageName is required for ANDROID_APP_DATA_STREAM',
          );
        }
        requestBody.androidAppStreamData = { packageName: android.packageName.trim() };
      }
      if (type === 'IOS_APP_DATA_STREAM') {
        const ios = a.iosAppStreamData as { bundleId?: string } | undefined;
        if (!ios?.bundleId?.trim()) {
          throw new Error(
            '[INVALID_ARGUMENT] iosAppStreamData.bundleId is required for IOS_APP_DATA_STREAM',
          );
        }
        requestBody.iosAppStreamData = { bundleId: ios.bundleId.trim() };
      }

      try {
        const response = await admin.properties.dataStreams.create({ parent, requestBody });
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
          },
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
