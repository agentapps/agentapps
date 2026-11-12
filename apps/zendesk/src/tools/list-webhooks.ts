import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-webhooks — GET /webhooks.
 */
export function registerListWebhooksTool(app: AgentApp): void {
  app.tool('list-webhooks', {
    description:
      'List Zendesk webhooks (HTTP endpoints that receive real-time event notifications). Returns curated rows { id, name, status, endpoint, createdAt }.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Results per page. Min 1, max 100, default 30.',
        },
        page: {
          type: 'number',
          description: 'Page number for pagination. Default 1.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { limit, page } = (args ?? {}) as {
        limit?: number;
        page?: number;
      };

      const result = await zendeskRequest<any>(ctx, '/webhooks', {
        query: {
          per_page: Math.min(limit ?? 30, 100),
          page: page ?? 1,
        },
      });

      const webhooks = (result.webhooks ?? []).map((w: any) => ({
        id: w.id,
        name: w.name,
        status: w.status,
        endpoint: w.endpoint,
        httpMethod: w.http_method,
        requestFormat: w.request_format,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
      }));

      return {
        webhooks,
        total: webhooks.length,
        page: page ?? 1,
        hasMore: result.meta?.has_more ?? false,
      };
    },
  });
}
