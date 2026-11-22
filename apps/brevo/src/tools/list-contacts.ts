import type { AgentApp } from '@agentapps/sdk';
import { brevoRequest } from '../lib/brevo-client.js';
import { clampInt, shapeContact } from './_helpers.js';

interface ListContactsResponse {
  contacts?: unknown[];
  count?: number;
}

/**
 * list-contacts — GET /contacts.
 */
export function registerListContactsTool(app: AgentApp): void {
  app.tool('list-contacts', {
    description:
      'List contacts from Brevo (GET /contacts). Returns { contacts:[{id,email,emailBlacklisted,smsBlacklisted,listIds,attributes,createdAt,modifiedAt}], count, limit, offset }. Params: limit? (1-1000, default 50), offset? (default 0).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max contacts to return (1-1000, default 50).',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Index of the first contact for pagination (default 0).',
          default: 0,
        },
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
      const limit = clampInt(a.limit, 1, 1000, 50);
      const offset = clampInt(a.offset, 0, Number.MAX_SAFE_INTEGER, 0);

      const res = await brevoRequest<ListContactsResponse>(ctx, '/contacts', {
        query: { limit, offset },
      });

      const contacts = (res.contacts ?? []).map(shapeContact);
      return {
        contacts,
        count: typeof res.count === 'number' ? res.count : contacts.length,
        limit,
        offset,
      };
    },
  });
}
