/**
 * get_cohort — get details of a specific cohort from Mixpanel.
 */

import type { AgentApp } from '@agentapps/sdk';
import { MIXPANEL_QUERY_URL, mixpanelRequest } from '../lib/mixpanel-client.js';

export function registerGetCohortTool(app: AgentApp): void {
  app.tool('get_cohort', {
    description:
      'Get details of a specific cohort from Mixpanel by cohort ID. Returns cohort metadata and definition.',
    parameters: {
      type: 'object',
      properties: {
        cohort_id: {
          type: 'number',
          description: 'The ID of the cohort to retrieve.',
        },
      },
      required: ['cohort_id'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      return await mixpanelRequest(
        'GET',
        MIXPANEL_QUERY_URL,
        `/cohorts/${args.cohort_id as number}`,
        null,
        ctx,
      );
    },
  });
}
