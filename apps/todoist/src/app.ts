import { createApp } from '@agentapps/sdk';
import { todoistRequest } from './lib/todoist-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.todoist',
  version: '2.0.3',
  name: 'Todoist',
  description:
    'Todoist task management — create, update, complete and delete tasks, organize projects, sections, labels and comments.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'productivity',
  keywords: ['todoist', 'tasks', 'todo', 'productivity', 'gtd'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['TODOIST_API_TOKEN'] },
});

app.health(async (ctx) => {
  await todoistRequest(ctx, '/projects');
  return { status: 'ready' as const };
});

registerTools(app);

export const factory = app.toFactory();
