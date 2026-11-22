/**
 * ElevenLabs Agent App — text-to-speech with multiple voices and models.
 *
 * Migrated from mca.elevenlabs (the legacy MCA).
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.elevenlabs',
  version: '2.0.0',
  name: 'ElevenLabs',
  description: 'Text-to-speech generation with multiple voices and models via the ElevenLabs API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'ai',
  keywords: ['elevenlabs', 'tts', 'text-to-speech', 'voice', 'audio'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing ElevenLabs API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY system secret is required — get one at https://elevenlabs.io/app/settings/api-keys',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready', message: 'ElevenLabs ready' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
