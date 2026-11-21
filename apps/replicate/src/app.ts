/**
 * Replicate Agent App — run any AI model on Replicate.
 *
 * Migrated from mca.replicate (the legacy MCA).
 *
 * This app provides:
 * - Model discovery and schema inspection
 * - Async prediction execution and polling
 * - Prediction management (cancel, list)
 * - Health check with API token validation
 */

import { createApp } from '@agentapps/sdk';
import { registerTools } from './tools/index.js';

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.replicate',
  version: '1.0.0',
  name: 'Replicate',
  description:
    'Run any AI model on Replicate. Discover models, start async predictions, poll for results, and manage running jobs.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'ai',
  keywords: ['replicate', 'ai', 'models', 'predictions', 'image-generation', 'video-generation'],
  runtime: { transport: 'stdio', command: 'tsx', args: ['src/app.ts'] },
  capabilities: { tools: true, health: true },
  auth: {
    type: 'api-key',
    systemSecrets: ['API_TOKEN'],
  },
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

app.health(async (ctx) => {
  ctx.log('debug', 'Running health check');

  const secrets = await ctx.secrets.getSystem();
  if (!secrets?.API_TOKEN) {
    return {
      status: 'not_ready',
      message: 'Missing Replicate API token',
      issues: [
        {
          code: 'MISSING_SECRET',
          message:
            'API_TOKEN system secret is required — get one at https://replicate.com/account/api-tokens',
          severity: 'error' as const,
        },
      ],
    };
  }

  return { status: 'ready', message: 'Replicate ready' };
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
