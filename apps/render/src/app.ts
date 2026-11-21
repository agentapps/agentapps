import { createApp } from '@agentapps/sdk';
import { renderRequest } from './lib/render-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.render',
  version: '2.0.0',
  name: 'Render',
  description:
    'Deploy and manage services on Render directly from your workspace. Supports web services, static sites, deployments, environment variables, custom domains, and more.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: [
    'render',
    'deploy',
    'paas',
    'hosting',
    'web service',
    'static site',
    'deployment',
    'production',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['RENDER_API_KEY'] },
});

app.health(async (ctx) => {
  await renderRequest(ctx, '/user');
  return { status: 'ready' as const, message: 'Render credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
