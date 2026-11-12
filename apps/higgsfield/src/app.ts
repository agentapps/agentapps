import { createApp } from '@agentapps/sdk';
import { resolveCredentials } from './lib/higgsfield-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.higgsfield',
  version: '2.0.0',
  name: 'Higgsfield',
  description:
    'Generate AI images and videos with Higgsfield - text-to-image, image-to-video, and consistent character generation with Soul.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'ai',
  keywords: [
    'higgsfield',
    'ai',
    'image-generation',
    'video-generation',
    'text-to-image',
    'image-to-video',
    'soul',
    'character',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['API_KEY', 'API_SECRET'] },
});

app.health(async (ctx) => {
  await resolveCredentials(ctx);
  return { status: 'ready' as const, message: 'Higgsfield credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
