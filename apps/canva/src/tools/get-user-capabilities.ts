import type { AgentApp } from '@agentapps/sdk';
import { buildUserCapabilitiesShape, canvaRequest } from '../lib/index.js';
import { USER_CAPABILITIES_FIELDS } from './_fields.js';
import { resolveFields } from './utils.js';

export function registerGetUserCapabilitiesTool(app: AgentApp): void {
  app.tool('get-user-capabilities', {
    description:
      'Get the authenticated user capabilities (Canva plan + role gating). Returns curated { capabilities: string[] }. Use to decide whether features like brand templates or autofill are available before calling them. Params: fields?, includeRaw.',
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
          description: 'Return raw Canva capabilities response. Default false.',
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
      const raw = await canvaRequest(ctx, '/users/me/capabilities');
      const shape = buildUserCapabilitiesShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: USER_CAPABILITIES_FIELDS,
      });
    },
  });
}
