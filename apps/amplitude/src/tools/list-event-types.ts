/**
 * list-event-types — list all event types from Amplitude's taxonomy.
 */

import type { AgentApp } from '@agentapps/sdk';
import { AMPLITUDE_EXPORT_URL, amplitudeRequest } from '../lib/amplitude-client.js';

export function registerListEventTypesTool(app: AgentApp): void {
  app.tool('list-event-types', {
    description:
      'List all event types defined in your Amplitude project taxonomy. Returns event type names, descriptions, and categories.',
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
      return await amplitudeRequest(
        'GET',
        AMPLITUDE_EXPORT_URL,
        '/taxonomy/event-types',
        null,
        ctx,
      );
    },
  });
}
