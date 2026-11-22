import type { AgentApp } from '@agentapps/sdk';
import {
  createAnalyticsClients,
  getAnalyticsSecrets,
  mapAnalyticsError,
  parsePropertyName,
  propertyIdOf,
} from '../lib/index.js';

/**
 * delete-property — Soft-delete a GA4 property.
 */
export function registerDeletePropertyTool(app: AgentApp): void {
  app.tool('delete-property', {
    description:
      'Soft-delete a GA4 property (recoverable for ~7 days from Google Analytics UI). Returns { property: { propertyId, deleteTime, ... } }.',
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
    // A soft delete, but only the Google Analytics UI can restore it: this app cannot.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getAnalyticsSecrets(ctx);
      const { admin, email } = await createAnalyticsClients(secrets);

      const name = parsePropertyName(a.propertyId as string);
      try {
        const response = await admin.properties.delete({ name });
        const p = response.data;
        return {
          account: email,
          property: {
            propertyId: propertyIdOf(p.name),
            name: p.name,
            displayName: p.displayName,
            parent: p.parent,
            deleteTime: p.deleteTime,
            updateTime: p.updateTime,
          },
          recoverable: true,
          recoverableWindowDays: 7,
        };
      } catch (err) {
        mapAnalyticsError(err);
      }
    },
  });
}
