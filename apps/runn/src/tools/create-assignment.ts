import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnAssignment } from '../lib/types.js';
import { ASSIGNMENT_FIELDS } from './_fields.js';
import {
  cleanOptionalString,
  validateDate,
  validateDateRange,
  validateId,
  validateMinutes,
} from './_runn-helpers.js';
import { firstOf, resolveFields, sanitiseBody } from './utils.js';

export function registerCreateAssignmentTool(app: AgentApp): void {
  app.tool('runn-create-assignment', {
    description:
      'Allocate a person (or placeholder) to a project at a role over a date range. Returns the curated created assignment. Not retryable (no idempotency key). Params: personId, projectId, roleId, startDate, endDate (YYYY-MM-DD), minutesPerDay (all required), isBillable?, note?, phaseId?, workstreamId?, isNonWorkingDay?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        personId: { type: 'number', description: 'Person OR placeholder id to assign.' },
        projectId: { type: 'number', description: 'Project id.' },
        roleId: { type: 'number', description: 'Role id the person works as on this assignment.' },
        startDate: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        endDate: { type: 'string', description: 'End date, YYYY-MM-DD (on or after startDate).' },
        minutesPerDay: { type: 'number', description: 'Allocated minutes per day (>= 0).' },
        isBillable: {
          type: 'boolean',
          description: 'Whether the assignment is billable. Default true.',
        },
        note: { type: 'string', description: 'Optional note.' },
        phaseId: { type: 'number', description: 'Optional project phase id.' },
        workstreamId: { type: 'number', description: 'Optional workstream id.' },
        isNonWorkingDay: { type: 'boolean', description: 'Whether it falls on a non-working day.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the result.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn assignment object. Default false.',
        },
      },
      required: ['personId', 'projectId', 'roleId', 'startDate', 'endDate', 'minutesPerDay'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const raw = args as {
        personId: number;
        projectId: number;
        roleId: number;
        startDate: string;
        endDate: string;
        minutesPerDay: number;
        isBillable?: boolean;
        note?: string;
        phaseId?: number;
        workstreamId?: number;
        isNonWorkingDay?: boolean;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateId(raw.personId, 'personId');
      validateId(raw.projectId, 'projectId');
      validateId(raw.roleId, 'roleId');
      const startDate = validateDate(raw.startDate, 'startDate');
      const endDate = validateDate(raw.endDate, 'endDate');
      validateDateRange(startDate, endDate);
      const minutesPerDay = validateMinutes(raw.minutesPerDay, 'minutesPerDay');
      if (raw.phaseId !== undefined) validateId(raw.phaseId, 'phaseId');
      if (raw.workstreamId !== undefined) validateId(raw.workstreamId, 'workstreamId');

      const payload = sanitiseBody({
        personId: raw.personId,
        projectId: raw.projectId,
        roleId: raw.roleId,
        startDate,
        endDate,
        minutesPerDay,
        isBillable: raw.isBillable,
        note: cleanOptionalString(raw.note),
        phaseId: raw.phaseId,
        workstreamId: raw.workstreamId,
        isNonWorkingDay: raw.isNonWorkingDay,
      });

      const data = firstOf(
        await runnRequest<RunnAssignment | RunnAssignment[]>('/assignments', ctx, {
          method: 'POST',
          body: payload,
        }),
      );
      return resolveFields(data as any, data, {
        includeRaw: raw.includeRaw,
        fields: raw.fields,
        defaultFields: ASSIGNMENT_FIELDS,
      });
    },
  });
}
