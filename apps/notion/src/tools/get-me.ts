import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { USER_FIELDS } from './_fields.js';
import { extractUserShape } from './_notion-helpers.js';
import { resolveFields, wrapNotionCall } from './utils.js';

export function registerGetMeTool(app: AgentApp): void {
  app.tool('get-me', {
    description:
      'Return the bot user (this integration). Returns curated { id, name, type, avatarUrl, email, bot }. Params: fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
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
    },
    annotations: { readOnlyHint: true, version: '1.1.0', stability: 'stable' },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { fields, includeRaw } = args as {
        fields?: string[];
        includeRaw?: boolean;
      };

      const raw: any = await wrapNotionCall(() => client.users.me({}));
      const shape = extractUserShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: USER_FIELDS,
      });
    },
  });
}
