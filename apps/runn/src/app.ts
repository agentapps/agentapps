import { createApp } from '@agentapps/sdk';
import { validateCredentials } from './lib/runn-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.runn',
  version: '2.0.2',
  name: 'Runn',
  description:
    'Runn resource management — projects, people, assignments, timesheets and capacity planning through the Runn API.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: [
    'runn',
    'resource-management',
    'capacity-planning',
    'project-management',
    'timesheets',
  ],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['API_KEY'] },
});

app.health(async (ctx) => {
  await validateCredentials(ctx);
  return { status: 'ready' as const, message: 'Runn API key is valid' };
});

registerTools(app);

export const factory = app.toFactory();
