import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * get-contact — GET /contacts/{contactId}.
 */
export function registerGetContactTool(app: AgentApp): void {
  app.tool('get-contact', {
    description: 'Get details of an Intercom contact (user or lead) by their Intercom ID.',
    parameters: {
      type: 'object',
      properties: {
        contactId: {
          type: 'string',
          description: 'The Intercom contact ID',
        },
      },
      required: ['contactId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { contactId } = args as { contactId: string };
      const c = await intercomRequest<Record<string, unknown>>(ctx, `/contacts/${contactId}`);
      return {
        id: c.id,
        type: c.type,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: c.created_at,
        lastSeenAt: c.last_seen_at,
        tags: (
          ((c.tags as Record<string, unknown> | undefined)?.data as Array<
            Record<string, unknown>
          >) ?? []
        ).map((t) => t.name),
        customAttributes: c.custom_attributes,
      };
    },
  });
}
