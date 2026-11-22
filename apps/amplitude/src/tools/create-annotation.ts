/**
 * create_annotation — create a chart annotation in Amplitude.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_DASHBOARD_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerCreateAnnotationTool(app: AgentApp): void {
  app.tool('create_annotation', {
    description:
      'Create a chart annotation in Amplitude. Adds a labeled marker on a specific date visible across dashboards and charts.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date for the annotation in YYYY-MM-DD format (e.g. "2024-01-15").',
        },
        label: {
          type: 'string',
          description: 'Short label for the annotation (e.g. "v2.0 Launch").',
        },
        details: {
          type: 'string',
          description: 'Optional longer description of the annotation.',
        },
      },
      required: ['date', 'label'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        date: args.date as string,
        label: args.label as string,
      };
      if (args.details) body.details = args.details as string;

      return await amplitudeRequest(
        'POST',
        AMPLITUDE_DASHBOARD_URL,
        '/annotations',
        null,
        ctx,
        body,
      );
    },
  });
}
