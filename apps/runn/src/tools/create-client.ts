import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnClient } from '../lib/types.js';
import { CLIENT_FIELDS } from './_fields.js';
import { cleanOptionalString, validateNonEmptyString } from './_runn-helpers.js';
import { firstOf, resolveFields, sanitiseBody } from './utils.js';

export function registerCreateClientTool(app: AgentApp): void {
  app.tool('runn-create-client', {
    description:
      'Create a Runn client. Returns the curated created client. Not retryable (no idempotency key). Params: name (required), website?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Client name.' },
        website: { type: 'string', description: 'Client website URL.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the result.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn client object. Default false.',
        },
      },
      required: ['name'],
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const raw = args as {
        name: string;
        website?: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      const name = validateNonEmptyString(raw.name, 'name');

      const payload = sanitiseBody({
        name,
        website: cleanOptionalString(raw.website),
      });

      const data = firstOf(
        await runnRequest<RunnClient | RunnClient[]>('/clients', ctx, {
          method: 'POST',
          body: payload,
        }),
      );
      return resolveFields(data as any, data, {
        includeRaw: raw.includeRaw,
        fields: raw.fields,
        defaultFields: CLIENT_FIELDS,
      });
    },
  });
}
