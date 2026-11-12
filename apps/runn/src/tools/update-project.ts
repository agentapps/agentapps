import type { AgentApp } from '@agentapps/sdk';
import { runnRequest } from '../lib/runn-client.js';
import type { RunnProject } from '../lib/types.js';
import { PROJECT_DETAIL_FIELDS } from './_fields.js';
import { cleanOptionalString, validateId } from './_runn-helpers.js';
import { firstOf, resolveFields, sanitiseBody } from './utils.js';

const PRICING_MODEL_ENUM = ['fp', 'tm', 'nb'] as const;
const RATE_TYPE_ENUM = ['hours', 'days'] as const;

export function registerUpdateProjectTool(app: AgentApp): void {
  app.tool('runn-update-project', {
    description:
      'Update a Runn project. Only the fields you pass are changed (PATCH semantics). Idempotent — safe to retry. Returns the curated updated project. Params: projectId (required), name?, clientId?, isConfirmed?, teamId?, budget?, expensesBudget?, pricingModel?, rateType?, rateCardId?, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'number', description: 'Runn project id to update.' },
        name: { type: 'string', description: 'New project name.' },
        clientId: { type: 'number', description: 'New client id.' },
        isConfirmed: { type: 'boolean', description: 'Confirmed (vs tentative) project.' },
        teamId: { type: 'number', description: 'New team id.' },
        budget: { type: 'number', description: 'Project budget.' },
        expensesBudget: { type: 'number', description: 'Expenses budget.' },
        pricingModel: {
          type: 'string',
          enum: [...PRICING_MODEL_ENUM],
          description: 'fp | tm | nb.',
        },
        rateType: { type: 'string', enum: [...RATE_TYPE_ENUM], description: 'hours | days.' },
        rateCardId: { type: 'number', description: 'Rate card id.' },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the result.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return the raw Runn project object. Default false.',
        },
      },
      required: ['projectId'],
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      const raw = args as {
        projectId: number;
        name?: string;
        clientId?: number;
        isConfirmed?: boolean;
        teamId?: number;
        budget?: number;
        expensesBudget?: number;
        pricingModel?: (typeof PRICING_MODEL_ENUM)[number];
        rateType?: (typeof RATE_TYPE_ENUM)[number];
        rateCardId?: number;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateId(raw.projectId, 'projectId');
      if (raw.clientId !== undefined) validateId(raw.clientId, 'clientId');
      if (raw.teamId !== undefined) validateId(raw.teamId, 'teamId');
      if (raw.rateCardId !== undefined) validateId(raw.rateCardId, 'rateCardId');

      const payload = sanitiseBody({
        name: cleanOptionalString(raw.name),
        clientId: raw.clientId,
        isConfirmed: raw.isConfirmed,
        teamId: raw.teamId,
        budget: raw.budget,
        expensesBudget: raw.expensesBudget,
        pricingModel: raw.pricingModel,
        rateType: raw.rateType,
        rateCardId: raw.rateCardId,
      });

      const data = firstOf(
        await runnRequest<RunnProject | RunnProject[]>(`/projects/${raw.projectId}`, ctx, {
          method: 'PATCH',
          body: payload,
        }),
      );
      return resolveFields(data as any, data, {
        includeRaw: raw.includeRaw,
        fields: raw.fields,
        defaultFields: PROJECT_DETAIL_FIELDS,
      });
    },
  });
}
