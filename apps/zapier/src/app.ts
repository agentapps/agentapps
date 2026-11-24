/**
 * Zapier Agent App — list and execute Zapier actions via the
 * Natural Language Actions (NLA) API.
 *
 * This app demonstrates:
 * - API-key authentication via installation secrets (Bearer token)
 * - Health check with secret validation
 * - Nine tools: list-actions, execute-action, preview-action,
 *   get-execution-log, list-logs, list-zaps, get-zap, enable-zap, disable-zap
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.zapier',
  version: '2.0.3',
  name: 'Zapier',
  description:
    'Zapier automation — list and execute Zapier actions via Natural Language Actions API.',
  tagline: 'List and execute Zapier actions via the Natural Language Actions API',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'automation',
  keywords: ['zapier', 'automation', 'workflows', 'integrations', 'nla'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    installationSecrets: ['API_KEY'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running Zapier health check');

  const installationSecrets = await ctx.secrets.getInstallation().catch((err: Error) => {
    if (/no user credentials/i.test(err.message)) return null;
    throw err;
  });

  if (!installationSecrets?.API_KEY) {
    return {
      status: 'not_ready',
      message: 'Missing Zapier NLA API key',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_KEY user secret is required — get one at https://nla.zapier.com/credentials/',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready' as const, message: 'Zapier connected' };
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

registerTools(app);

// ---------------------------------------------------------------------------
// Export factory
// ---------------------------------------------------------------------------

export const factory = app.toFactory();
export default factory;
