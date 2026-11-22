import type { AgentApp } from '@agentapps/sdk';
import { buildUserShape, canvaRequest } from '../lib/index.js';
import { USER_FIELDS } from './_fields.js';
import { resolveFields } from './utils.js';

export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description:
      'Get the authenticated Canva user. Returns curated { userId, teamId }. Params: fields?, includeRaw.',
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
          description: 'Return raw Canva /users/me response. Default false.',
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
      const { fields, includeRaw } = args as { fields?: string[]; includeRaw?: boolean };
      const raw = await canvaRequest(ctx, '/users/me');
      const shape = buildUserShape(raw);
      return resolveFields(shape as any, raw, { includeRaw, fields, defaultFields: USER_FIELDS });
    },
  });
}
