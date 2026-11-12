import type { AgentApp } from '@agentapps/sdk';
import { buildUserProfileShape, canvaRequest } from '../lib/index.js';
import { USER_PROFILE_FIELDS } from './_fields.js';
import { resolveFields } from './utils.js';

export function registerGetUserProfileTool(app: AgentApp): void {
  app.tool('get-user-profile', {
    description:
      "Get the authenticated user's profile. Returns curated { displayName }. Params: fields?, includeRaw.",
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
          description: 'Return raw Canva profile response. Default false.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { fields, includeRaw } = args as { fields?: string[]; includeRaw?: boolean };
      const raw = await canvaRequest(ctx, '/users/me/profile');
      const shape = buildUserProfileShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: USER_PROFILE_FIELDS,
      });
    },
  });
}
