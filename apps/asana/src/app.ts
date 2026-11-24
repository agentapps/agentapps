import { createApp } from '@agentapps/sdk';
import { asanaRequest } from './lib/asana-client.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.asana',
  version: '2.0.3',
  name: 'Asana',
  description:
    'Asana project management — manage tasks, projects, workspaces, sections, tags, teams, and users.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'project-management',
  keywords: ['asana', 'tasks', 'projects', 'management', 'collaboration'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, health: true },
  auth: { type: 'api-key', installationSecrets: ['ACCESS_TOKEN'] },
});

app.health(async (ctx) => {
  await asanaRequest(ctx, 'users/me');
  return { status: 'ready' as const };
});

registerTools(app);

export const factory = app.toFactory();
