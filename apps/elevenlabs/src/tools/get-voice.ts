/**
 * get-voice — get detailed information about a specific voice.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, elevenLabsRequest } from '../types.js';

export function registerGetVoiceTool(app: AgentApp): void {
  app.tool('get-voice', {
    description:
      'Get detailed information about a specific ElevenLabs voice including settings and samples.',
    parameters: {
      type: 'object',
      properties: {
        voiceId: {
          type: 'string',
          description: 'The voice ID to get information about.',
        },
      },
      required: ['voiceId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      const voiceId = args.voiceId as string;
      ctx.log('info', `Getting voice: ${voiceId}`);

      const response = await elevenLabsRequest(`/voices/${voiceId}`, apiKey);
      await assertOk(response);
      return await response.json();
    },
  });
}
