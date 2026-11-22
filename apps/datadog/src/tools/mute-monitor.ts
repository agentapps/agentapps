/**
 * mute_monitor — mute a Datadog monitor.
 */

import type { AgentApp } from '@agentapps/sdk';
import { datadogRequest } from '../lib/datadog-client.js';

export function registerMuteMonitorTool(app: AgentApp): void {
  app.tool('mute_monitor', {
    description:
      'Mute a Datadog monitor by ID. Optionally specify an end timestamp for the mute period.',
    parameters: {
      type: 'object',
      properties: {
        monitorId: {
          type: 'number',
          description: 'The Datadog monitor ID to mute.',
        },
        end: {
          type: 'number',
          description:
            'UNIX epoch timestamp (seconds) when the mute should end. Omit for indefinite mute.',
        },
      },
      required: ['monitorId'],
    },
    // Silences a monitor's alerts (indefinitely when `end` is omitted). It changes a state and
    // deletes nothing, so it is not destructive, although this app has no unmute tool.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const monitorId = args.monitorId as number;
      const body: Record<string, unknown> = {};
      if (args.end !== undefined) body.end = args.end as number;

      return await datadogRequest('POST', `/api/v1/monitor/${monitorId}/mute`, { body }, ctx);
    },
  });
}
