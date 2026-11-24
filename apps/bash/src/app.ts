/**
 * Bash Agent App — execute shell commands with timeout and working directory.
 *
 * Migrated from the legacy MCA runtime.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.bash',
  version: '1.0.3',
  name: 'Bash',
  description:
    'Execute bash commands on the system. Provides shell access for automation and system tasks.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'development',
  keywords: ['bash', 'shell', 'command', 'terminal', 'system'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  // Bash needs POSIX access to the Workspace Volume (grep, find, cat, pipes):
  // mount mode (VOL-REQ-4), which requires the volume Permission (VOL-REQ-2).
  mountVolume: true,
  permissions: { volume: true },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');
  return { status: 'ready', message: 'Bash ready' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
