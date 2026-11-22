/**
 * get_cohort — get a single cohort by ID from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetCohortTool(app: AgentApp): void {
  app.tool('get_cohort', {
    description:
      'Get details of a specific cohort by ID from Amplitude. Returns the cohort definition, size, and metadata.',
    parameters: {
      type: 'object',
      properties: {
        cohortId: {
          type: 'string',
          description: 'The ID of the cohort to retrieve.',
        },
      },
      required: ['cohortId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const cohortId = args.cohortId as string;

      return await amplitudeRequest(
        'GET',
        AMPLITUDE_DASHBOARD_URL,
        `/cohorts/${cohortId}`,
        null,
        ctx,
      );
    },
  });
}
