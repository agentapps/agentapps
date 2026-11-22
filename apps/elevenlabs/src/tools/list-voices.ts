/**
 * list-voices — list available ElevenLabs voices with optional filtering.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, elevenLabsRequest } from '../types.js';

export function registerListVoicesTool(app: AgentApp): void {
  app.tool('list-voices', {
    description:
      'List available voices from your ElevenLabs account. ' +
      'Supports filtering by name and category.',
    parameters: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Filter voices by name (case-insensitive).',
        },
        category: {
          type: 'string',
          enum: ['premade', 'cloned', 'generated', 'professional'],
          description: 'Filter by voice category.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of voices to return.',
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
      const apiKey = await ctx.systemSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY system secret.');

      ctx.log('info', 'Listing voices');

      const response = await elevenLabsRequest('/voices', apiKey);
      await assertOk(response);

      const data = await response.json();
      let voices = (data.voices || []) as Array<Record<string, unknown>>;

      const search = (args.search as string)?.toLowerCase();
      if (search) {
        voices = voices.filter((v) => (v.name as string).toLowerCase().includes(search));
      }

      const category = args.category as string | undefined;
      if (category) {
        voices = voices.filter((v) => v.category === category);
      }

      const limit = args.limit as number | undefined;
      if (limit && limit > 0) {
        voices = voices.slice(0, limit);
      }

      return voices.map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.description,
        labels: v.labels,
        preview_url: v.preview_url,
      }));
    },
  });
}
