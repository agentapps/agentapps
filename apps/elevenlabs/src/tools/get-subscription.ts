/**
 * get_subscription — check ElevenLabs usage and limits.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, elevenLabsRequest } from '../types.js';

export function registerGetSubscriptionTool(app: AgentApp): void {
  app.tool('get_subscription', {
    description:
      'Get information about your ElevenLabs subscription: character usage, limits, and tier.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      ctx.log('info', 'Getting subscription info');

      const response = await elevenLabsRequest('/user/subscription', apiKey);
      await assertOk(response);
      const data = await response.json();

      return {
        tier: data.tier,
        character_count: data.character_count,
        character_limit: data.character_limit,
        characters_remaining: data.character_limit - data.character_count,
        next_reset_unix: data.next_character_count_reset_unix,
        voice_limit: data.voice_limit,
        status: data.status,
      };
    },
  });
}
