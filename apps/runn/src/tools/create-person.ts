import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnPerson } from '../lib/types.js';
import { PERSON_DETAIL_FIELDS } from './_fields.js';
import {
  cleanOptionalString,
  validateDate,
  validateId,
  validateNonEmptyString,
} from './_runn-helpers.js';
import { firstOf, resolveFields, sanitiseBody } from './utils.js';

const EMPLOYMENT_TYPE_ENUM = ['employee', 'contractor'] as const;

export function registerCreatePersonTool(app: AgentApp): void {
  app.tool('runn-create-person', {
    description:
      'Create a Runn person. A first contract (role) is created with them. Returns the curated created person. Not retryable (no idempotency key). Params: firstName, lastName, roleId (all required), email?, teamId?, startDate? (YYYY-MM-DD), employmentType? (employee|contractor), costPerHour?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'First name.' },
        lastName: { type: 'string', description: 'Last name.' },
        roleId: { type: 'number', description: 'Role id for the initial contract (required).' },
        email: { type: 'string', description: 'Email address.' },
        teamId: { type: 'number', description: 'Team id.' },
        startDate: {
          type: 'string',
          description: 'Contract start date, YYYY-MM-DD. Defaults to today.',
        },
        employmentType: {
          type: 'string',
          enum: [...EMPLOYMENT_TYPE_ENUM],
          description: 'Employment type. Default employee.',
        },
        costPerHour: { type: 'number', description: 'Cost per hour. Defaults to the role cost.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the result.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn person object. Default false.',
        },
      },
      required: ['firstName', 'lastName', 'roleId'],
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
    handler: async (args, ctx) => {
      const raw = args as {
        firstName: string;
        lastName: string;
        roleId: number;
        email?: string;
        teamId?: number;
        startDate?: string;
        employmentType?: (typeof EMPLOYMENT_TYPE_ENUM)[number];
        costPerHour?: number;
        fields?: string[];
        includeRaw?: boolean;
      };
      const firstName = validateNonEmptyString(raw.firstName, 'firstName');
      const lastName = validateNonEmptyString(raw.lastName, 'lastName');
      validateId(raw.roleId, 'roleId');
      if (raw.teamId !== undefined) validateId(raw.teamId, 'teamId');
      const startDate =
        raw.startDate !== undefined ? validateDate(raw.startDate, 'startDate') : undefined;

      const payload = sanitiseBody({
        firstName,
        lastName,
        roleId: raw.roleId,
        email: cleanOptionalString(raw.email),
        teamId: raw.teamId,
        startDate,
        employmentType: raw.employmentType,
        costPerHour: raw.costPerHour,
      });

      const data = firstOf(
        await runnRequest<RunnPerson | RunnPerson[]>('/people', ctx, {
          method: 'POST',
          body: payload,
        }),
      );
      return resolveFields(data as any, data, {
        includeRaw: raw.includeRaw,
        fields: raw.fields,
        defaultFields: PERSON_DETAIL_FIELDS,
      });
    },
  });
}
