import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnPerson } from '../lib/types.js';
import { PERSON_DETAIL_FIELDS } from './_fields.js';
import { validateId } from './_runn-helpers.js';
import { resolveFields } from './utils.js';

export function registerGetPersonTool(app: AgentApp): void {
  app.tool('get-person', {
    description:
      'Get a single Runn person by id. Returns curated detail { id, firstName, lastName, email, isArchived, teamId, tags, references, holidaysGroupId, managers, ... }. Params: personId (required), fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        personId: { type: 'number', description: 'Runn person id.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn person object. Default false.',
        },
      },
      required: ['personId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { personId, fields, includeRaw } = args as {
        personId: number;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateId(personId, 'personId');

      const data = await runnRequest<RunnPerson>(`/people/${personId}`, ctx, {});
      return resolveFields(data as any, data, {
        includeRaw,
        fields,
        defaultFields: PERSON_DETAIL_FIELDS,
      });
    },
  });
}
