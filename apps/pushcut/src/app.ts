/**
 * Pushcut Agent App — smart notifications and iOS automation.
 *
 * Send push notifications, execute Shortcuts, and activate HomeKit scenes
 * on your iOS devices via the Pushcut API.
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.pushcut',
  version: '1.0.0',
  name: 'Pushcut',
  description:
    'Send smart notifications, execute Shortcuts and HomeKit scenes on your iOS devices via the Pushcut API.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'automation',
  keywords: ['pushcut', 'notifications', 'shortcuts', 'homekit', 'ios', 'automation'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    // The API key identifies one user's Pushcut account (notifications land on
    // THEIR devices), so it is a per-user secret. Required: the SDK rejects
    // tool calls until the user configures it.
    installationSecrets: ['API_KEY'],
  },
});

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const installationSecrets = await ctx.secrets.getInstallation();
  if (!installationSecrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Pushcut API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY user secret is required — generate one in the Pushcut app under Account > API Keys',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready', message: 'Pushcut ready' };
});

registerTools(app);

export const factory = app.toFactory();
export default factory;
