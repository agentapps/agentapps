/**
 * list_session_recordings — list session recordings in PostHog.
 */

import type { AgentApp } from '@agentapps/sdk';
import { posthogRequest } from '../lib/posthog-client.js';

export function registerListSessionRecordingsTool(app: AgentApp): void {
  app.tool('list_session_recordings', {
    description:
      'List session recordings captured in the PostHog project. Returns recent recordings with optional limit.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of session recordings to return (default 10).',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const limit = (args.limit as number) ?? 10;
      return await posthogRequest('GET', 'session_recordings', { query: { limit } }, ctx);
    },
  });
}
