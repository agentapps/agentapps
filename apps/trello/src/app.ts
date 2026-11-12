import { createApp } from '@agentapps/sdk';
import { trelloRequest } from './lib/trello-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.trello',
  version: '2.0.0',
  name: 'Trello',
  description:
    'Trello project management — manage boards, lists, cards, labels, and search across your Trello workspace.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['trello', 'boards', 'cards', 'project-management', 'kanban'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['TRELLO_API_KEY'],
    installationSecrets: ['TRELLO_TOKEN'],
  },
});

app.health(async (ctx) => {
  await trelloRequest(ctx, '/members/me');
  return { status: 'ready' as const, message: 'Trello credentials are valid' };
});

registerTools(app);

export const factory = app.toFactory();
