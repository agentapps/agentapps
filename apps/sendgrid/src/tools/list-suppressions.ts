/**
 * list-suppressions — GET /suppression/bounces or /suppression/blocks
 *
 * Retrieve suppression entries (bounces or blocks) from SendGrid.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerListSuppressionsTool(app: AgentApp): void {
  app.tool('list-suppressions', {
    description:
      'List suppression entries from SendGrid (GET /suppression/bounces or /suppression/blocks). Specify the type of suppression to retrieve. Returns { suppressions }.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['bounces', 'blocks'],
          description: 'Type of suppression to list: "bounces" or "blocks".',
        },
        startTime: {
          type: 'number',
          description: 'Optional start time as Unix timestamp to filter results.',
        },
        endTime: {
          type: 'number',
          description: 'Optional end time as Unix timestamp to filter results.',
        },
      },
      required: ['type'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const type = args.type as 'bounces' | 'blocks';
      const startTime = args.startTime as number | undefined;
      const endTime = args.endTime as number | undefined;

      if (!type) {
        throw new Error('Suppression type is required ("bounces" or "blocks").');
      }

      const params: string[] = [];
      if (startTime !== undefined) params.push(`start_time=${startTime}`);
      if (endTime !== undefined) params.push(`end_time=${endTime}`);

      let path = `/suppression/${type}`;
      if (params.length > 0) {
        path += `?${params.join('&')}`;
      }

      const res = await sendgridRequest('GET', path, null, ctx);

      return {
        suppressions: Array.isArray(res) ? res : [],
      };
    },
  });
}
