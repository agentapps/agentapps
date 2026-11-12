import { createApp } from '@agentapps/sdk';
import { rahRequest } from './lib/rah-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.rentahuman',
  version: '2.0.0',
  name: 'RentAHuman.ai',
  description:
    'Hire humans for physical-world tasks. Search 657,000+ verified humans in 50+ countries, create bookings, and manage tasks that require real-world presence.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['humans', 'physical-tasks', 'hire', 'booking', 'real-world', 'errands', 'workforce'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['RENTAHUMAN_API_KEY'] },
});

app.health(async (ctx) => {
  await rahRequest(ctx, '/humans', { publicEndpoint: true, query: { limit: 1 } });
  return { status: 'ready' as const, message: 'Rent A Human API is reachable' };
});

registerTools(app);

export const factory = app.toFactory();
