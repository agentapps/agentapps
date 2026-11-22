/**
 * get-chart — get a single chart by ID from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetChartTool(app: AgentApp): void {
  app.tool('get-chart', {
    description:
      'Get details of a specific chart by ID from Amplitude. Returns the chart definition, configuration, and metadata.',
    parameters: {
      type: 'object',
      properties: {
        chartId: {
          type: 'string',
          description: 'The ID of the chart to retrieve.',
        },
      },
      required: ['chartId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const chartId = args.chartId as string;

      return await amplitudeRequest(
        'GET',
        AMPLITUDE_DASHBOARD_URL,
        `/charts/${chartId}`,
        null,
        ctx,
      );
    },
  });
}
