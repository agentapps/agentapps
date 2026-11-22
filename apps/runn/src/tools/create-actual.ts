import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnActual } from '../lib/types.js';
import { ACTUAL_FIELDS } from './_fields.js';
import { cleanOptionalString, validateDate, validateId, validateMinutes } from './_runn-helpers.js';
import { firstOf, resolveFields, sanitiseBody } from './utils.js';

export function registerCreateActualTool(app: AgentApp): void {
  app.tool('create-actual', {
    description:
      'Log a Runn actual (real hours worked on a day). The minutes overwrite any existing actual for the same day/person/project/role/workstream. Returns the curated actual. Params: date (YYYY-MM-DD), billableMinutes, nonbillableMinutes, personId, projectId, roleId (all required), billableNote?, nonbillableNote?, phaseId?, workstreamId?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Day the work was done, YYYY-MM-DD.' },
        billableMinutes: { type: 'number', description: 'Billable minutes (>= 0).' },
        nonbillableMinutes: { type: 'number', description: 'Non-billable minutes (>= 0).' },
        personId: { type: 'number', description: 'Person id.' },
        projectId: { type: 'number', description: 'Project id.' },
        roleId: { type: 'number', description: 'Role id.' },
        billableNote: { type: 'string', description: 'Optional note for the billable time.' },
        nonbillableNote: {
          type: 'string',
          description: 'Optional note for the non-billable time.',
        },
        phaseId: { type: 'number', description: 'Optional project phase id.' },
        workstreamId: { type: 'number', description: 'Optional workstream id.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the result.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn actual object. Default false.',
        },
      },
      required: [
        'date',
        'billableMinutes',
        'nonbillableMinutes',
        'personId',
        'projectId',
        'roleId',
      ],
    },
    // Runn upserts the actual for that day/person/project/role: the same call twice changes nothing
    // more, and logging the previous minutes again undoes it, so it is a set-to-value, not destructive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const raw = args as {
        date: string;
        billableMinutes: number;
        nonbillableMinutes: number;
        personId: number;
        projectId: number;
        roleId: number;
        billableNote?: string;
        nonbillableNote?: string;
        phaseId?: number;
        workstreamId?: number;
        fields?: string[];
        includeRaw?: boolean;
      };
      const date = validateDate(raw.date, 'date');
      const billableMinutes = validateMinutes(raw.billableMinutes, 'billableMinutes');
      const nonbillableMinutes = validateMinutes(raw.nonbillableMinutes, 'nonbillableMinutes');
      validateId(raw.personId, 'personId');
      validateId(raw.projectId, 'projectId');
      validateId(raw.roleId, 'roleId');
      if (raw.phaseId !== undefined) validateId(raw.phaseId, 'phaseId');
      if (raw.workstreamId !== undefined) validateId(raw.workstreamId, 'workstreamId');

      const payload = sanitiseBody({
        date,
        billableMinutes,
        nonbillableMinutes,
        personId: raw.personId,
        projectId: raw.projectId,
        roleId: raw.roleId,
        billableNote: cleanOptionalString(raw.billableNote),
        nonbillableNote: cleanOptionalString(raw.nonbillableNote),
        phaseId: raw.phaseId,
        workstreamId: raw.workstreamId,
      });

      const data = firstOf(
        await runnRequest<RunnActual | RunnActual[]>('/actuals', ctx, {
          method: 'POST',
          body: payload,
        }),
      );
      return resolveFields(data as any, data, {
        includeRaw: raw.includeRaw,
        fields: raw.fields,
        defaultFields: ACTUAL_FIELDS,
      });
    },
  });
}
