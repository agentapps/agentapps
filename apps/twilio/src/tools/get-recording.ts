/**
 * get_recording — retrieve a single Twilio recording by SID.
 */

import type { AgentApp } from '@agentapps/sdk';
import { twilioRequest } from '../lib/twilio-client.js';

export function registerGetRecordingTool(app: AgentApp): void {
  app.tool('get_recording', {
    description:
      'Get detailed information about a specific Twilio recording by its SID, including duration, channels, and media URL.',
    parameters: {
      type: 'object',
      properties: {
        recordingSid: {
          type: 'string',
          description: 'The Twilio recording SID (e.g. RE...).',
        },
      },
      required: ['recordingSid'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const recordingSid = args.recordingSid as string;
      return await twilioRequest('GET', `/Recordings/${recordingSid}`, null, ctx);
    },
  });
}
