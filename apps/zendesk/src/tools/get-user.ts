import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * get-user — GET /users/{id}.json.
 */
export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description: 'Get a single Zendesk user by ID with full details.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Zendesk user ID.',
        },
      },
      required: ['userId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { userId } = args as { userId: string };

      const result = await zendeskRequest<any>(ctx, `/users/${userId}.json`);
      const u = result.user;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        phone: u.phone,
        timeZone: u.time_zone,
        locale: u.locale,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
        tags: u.tags ?? [],
        organizationId: u.organization_id,
        url: u.url,
      };
    },
  });
}
