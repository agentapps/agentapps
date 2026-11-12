/**
 * get_annotations — get chart annotations from Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerGetAnnotationsTool(app: AgentApp): void {
  app.tool('get_annotations', {
    description:
      'Get all chart annotations from Amplitude. Returns annotations with their labels, dates, and descriptions.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await amplitudeRequest('GET', AMPLITUDE_DASHBOARD_URL, '/annotations', null, ctx);
    },
  });
}
