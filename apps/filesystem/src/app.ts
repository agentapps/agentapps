/**
 * Filesystem Agent App — read, write, edit, search, and manage files.
 *
 * Migrated from the legacy MCA runtime.
 * Path-traversal safe, shell-injection safe, gitignore aware.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.filesystem',
  version: '1.0.0',
  name: 'Filesystem',
  description:
    'Filesystem operations: read, write, edit, patch, search (glob/grep), list, tree, stat, hash, copy, move, delete, and mkdir.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['files', 'filesystem', 'read', 'write', 'edit', 'search', 'grep', 'glob'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');
  return { status: 'ready', message: 'Filesystem ready' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
