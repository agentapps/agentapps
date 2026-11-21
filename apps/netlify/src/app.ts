import { createApp } from '@agentapps/sdk';
import { netlifyClient } from './lib/netlify-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.netlify',
  version: '2.0.0',
  name: 'Netlify',
  description:
    'Deploy static sites (HTML/CSS/JS) from the workspace to Netlify and return the public URL. Uses the file-digest REST API with a per-user Personal Access Token.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['netlify', 'deploy', 'static site', 'hosting', 'cdn', 'web'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['NETLIFY_TOKEN'] },
});

app.health(async (ctx) => {
  const client = await netlifyClient(ctx);
  await client.getUser();
  return { status: 'ready' as const, message: 'Netlify credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
