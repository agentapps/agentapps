/**
 * list_charts — list all charts in an Amplitude project.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerListChartsTool(app: AgentApp): void {
  app.tool('list_charts', {
    description: 'List all charts in your Amplitude project. Returns chart IDs, names, and types.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await amplitudeRequest('GET', AMPLITUDE_DASHBOARD_URL, '/charts', null, ctx);
    },
  });
}
