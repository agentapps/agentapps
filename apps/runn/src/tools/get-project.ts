import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnProject } from '../lib/types.js';
import { PROJECT_DETAIL_FIELDS } from './_fields.js';
import { validateId } from './_runn-helpers.js';
import { resolveFields } from './utils.js';

export function registerGetProjectTool(app: AgentApp): void {
  app.tool('get-project', {
    description:
      'Get a single Runn project by id. Returns curated detail { id, name, clientId, teamId, isArchived, isConfirmed, pricingModel, rateType, budget, expensesBudget, tags, references, ... }. Params: projectId (required), fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Runn project id.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn project object. Default false.',
        },
      },
      required: ['projectId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { projectId, fields, includeRaw } = args as {
        projectId: number;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateId(projectId, 'projectId');

      const data = await runnRequest<RunnProject>(`/projects/${projectId}`, ctx, {});
      return resolveFields(data as any, data, {
        includeRaw,
        fields,
        defaultFields: PROJECT_DETAIL_FIELDS,
      });
    },
  });
}
