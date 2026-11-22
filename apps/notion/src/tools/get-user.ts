import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { USER_FIELDS } from './_fields.js';
import { extractUserShape, validateUuid } from './_notion-helpers.js';
import { resolveFields, wrapNotionCall } from './utils.js';

export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description:
      'Retrieve a user by ID. Returns curated { id, name, type, avatarUrl, email, bot }. Params: userId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User UUID.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion user. Default false.',
        },
      },
      required: ['userId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
      version: '1.1.0',
      stability: 'stable',
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { userId, fields, includeRaw } = args as {
        userId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateUuid(userId, 'userId');

      const raw: any = await wrapNotionCall(() => client.users.retrieve({ user_id: userId }));
      const shape = extractUserShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: USER_FIELDS,
      });
    },
  });
}
