import { createApp } from '@agentapps/sdk';
import { mondayRequest } from './lib/monday-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.monday',
  version: '2.0.1',
  name: 'Monday.com',
  description: 'Monday.com work management - boards, items, groups, columns, updates',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['monday', 'boards', 'items', 'project-management', 'work-management'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['MONDAY_API_TOKEN'] },
});

app.health(async (ctx) => {
  await mondayRequest(ctx, `query { me { id } }`);
  return { status: 'ready' as const, message: 'Monday.com API is reachable.' };
});

registerTools(app);

export const factory = app.toFactory();
