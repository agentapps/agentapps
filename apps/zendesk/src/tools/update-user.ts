import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * update-user — PUT /users/{id}.json.
 */
export function registerUpdateUserTool(app: AgentApp): void {
  app.tool('update-user', {
    description:
      'Update an existing Zendesk user. Only provided fields are changed. Returns the updated user. Params: userId, name?, email?, role?, phone?, organizationId?, tags?, active?.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'Zendesk user ID to update.',
        },
        name: {
          type: 'string',
          description: 'New full name.',
        },
        email: {
          type: 'string',
          description: 'New email address (must be unique).',
        },
        role: {
          type: 'string',
          enum: ['end-user', 'agent', 'admin'],
          description: 'New user role.',
        },
        phone: {
          type: 'string',
          description: 'New phone number.',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID to associate the user with.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace existing tags with these.',
        },
        active: {
          type: 'boolean',
          description: 'Activate or deactivate the user.',
        },
      },
      required: ['userId'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { userId, name, email, role, phone, organizationId, tags, active } = args as {
        userId: string;
        name?: string;
        email?: string;
        role?: string;
        phone?: string;
        organizationId?: string;
        tags?: string[];
        active?: boolean;
      };

      const user: Record<string, unknown> = {};
      if (name) user.name = name;
      if (email) user.email = email;
      if (role) user.role = role;
      if (phone) user.phone = phone;
      if (organizationId) user.organization_id = Number(organizationId);
      if (tags) user.tags = tags;
      if (active !== undefined) user.active = active;

      const result = await zendeskRequest<any>(ctx, `/users/${userId}.json`, {
        method: 'PUT',
        body: { user },
      });

      const u = result.user;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        updatedAt: u.updated_at,
        url: u.url,
      };
    },
  });
}
